const Razorpay = require('razorpay');
const crypto = require('crypto');
const Tenant = require('../models/Tenant.model');
const Payment = require('../models/Payment.model');
const { Plan } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');
const logger = require('../utils/logger');
const mailerService = require('../services/mailer.service');

// Initialize Razorpay with TEST credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_REPLACE_WITH_YOUR_KEY',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_SECRET',
});

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order for the selected plan
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { planId, couponCode, referralCode } = req.body;
    if (!planId) return error(res, 'Plan ID is required', 400);

    const plan = await Plan.findOne({ _id: planId, isActive: true });
    if (!plan) return error(res, 'Invalid or inactive plan', 400);

    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return error(res, 'Tenant not found', 404);

    // Calculate final price after coupon
    let finalAmount = plan.price;
    let discountApplied = 0;
    let couponData = null;

    if (couponCode) {
      try {
        const { Coupon } = require('../models/index');
        const coupon = await Coupon.findOne({
          code: couponCode.toUpperCase(),
          isActive: true,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        });
        if (coupon) {
          if (coupon.discountType === 'percentage') {
            discountApplied = (finalAmount * coupon.discountValue) / 100;
          } else {
            discountApplied = coupon.discountValue;
          }
          finalAmount = Math.max(0, finalAmount - discountApplied);
          couponData = { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue };
        }
      } catch (couponErr) {
        logger.warn(`Coupon lookup failed: ${couponErr.message}`);
      }
    }

    // Razorpay amounts are in paise (INR × 100)
    const amountInPaise = Math.round(finalAmount * 100);

    // Guard: Razorpay rejects zero-amount orders
    if (amountInPaise <= 0) {
      return error(res, 'Cannot create a payment order for a free plan. Please select a paid plan.', 400);
    }

    // Create Razorpay order
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: plan.currency || 'INR',
        receipt: `nvr_${tenant._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
        notes: {
          tenantId: tenant._id.toString(),
          planId: plan._id.toString(),
          planName: plan.name,
          couponCode: couponCode || '',
        },
      });
    } catch (rzpErr) {
      // Razorpay SDK errors may have .error.description or .message
      const rzpMsg = rzpErr?.error?.description || rzpErr?.message || 'Razorpay order creation failed';
      logger.error(`[Razorpay] orders.create failed: ${JSON.stringify(rzpErr?.error || rzpErr?.message || rzpErr)}`);
      return error(res, `Payment gateway error: ${rzpMsg}`, 502);
    }

    // Save pending payment record
    const payment = await Payment.create({
      tenantId: req.tenantId,
      planId: plan._id,
      planName: plan.name,
      razorpayOrderId: razorpayOrder.id,
      amount: finalAmount,
      originalAmount: plan.price,
      discountApplied,
      couponCode: couponCode || null,
      couponData,
      referralCode: referralCode || null,
      currency: plan.currency || 'INR',
      status: 'pending',
      billingCycle: plan.billingCycle,
    });

    logger.info(`[Razorpay] Order created: ${razorpayOrder.id} for tenant ${req.tenantId}`);

    return success(res, {
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: razorpayOrder.currency,
      paymentId: payment._id,
      plan: {
        name: plan.displayName,
        price: plan.price,
        finalPrice: finalAmount,
        discountApplied,
        billingCycle: plan.billingCycle,
      },
      // Return Razorpay key so frontend can open the checkout
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_REPLACE_WITH_YOUR_KEY',
    }, 'Order created successfully');

  } catch (err) {
    const msg = err?.error?.description || err?.message || 'Unknown error';
    logger.error(`[Razorpay] createOrder error: ${msg}`);
    next(err);
  }
};

/**
 * POST /api/payments/verify
 * Verifies Razorpay payment signature & activates subscription
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId, // our internal payment doc ID
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return error(res, 'Payment verification data is incomplete', 400);
    }

    // 1. Verify signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_SECRET')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      // Mark payment as failed
      await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { status: 'failed', razorpayPaymentId: razorpay_payment_id, failedAt: new Date() }
      );
      return error(res, 'Payment verification failed. Invalid signature.', 400);
    }

    // 2. Find payment record
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) return error(res, 'Payment record not found', 404);

    if (payment.status === 'captured') {
      return success(res, {}, 'Payment already processed');
    }

    // 3. Fetch payment details from Razorpay to double-check
    let rzpPayment;
    try {
      rzpPayment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (fetchErr) {
      logger.warn(`[Razorpay] Could not fetch payment details: ${fetchErr.message}`);
    }

    // 4. Update payment record
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'captured';
    payment.capturedAt = new Date();
    if (rzpPayment) {
      payment.method = rzpPayment.method;
      payment.rzpStatus = rzpPayment.status;
    }
    await payment.save();

    // 5. Activate tenant subscription
    const plan = await Plan.findById(payment.planId);
    if (!plan) return error(res, 'Plan not found', 404);

    const tenant = await Tenant.findById(payment.tenantId);
    if (!tenant) return error(res, 'Tenant not found', 404);

    const subscriptionDays = plan.billingCycle === 'yearly' ? 365 : 30;
    tenant.planId = plan._id;
    tenant.planName = plan.name;
    tenant.planStatus = 'active';
    tenant.isOnTrial = false;
    tenant.maxDomains = plan.maxDomains;
    tenant.maxClients = plan.maxClients;
    tenant.maxHosting = plan.maxHosting;
    tenant.maxStaff = plan.maxStaff;
    tenant.subscriptionStart = new Date();
    tenant.subscriptionEnd = new Date(Date.now() + subscriptionDays * 86400000);
    tenant.approvedAt = new Date();
    await tenant.save();

    // 6. Send confirmation email
    const adminUser = await require('../models/User.model').findById(tenant.adminId).select('name email');
    if (adminUser?.email) {
      mailerService.sendPaymentConfirmationEmail?.(
        adminUser.email,
        adminUser.name,
        tenant.orgName,
        plan.displayName,
        payment.amount,
        payment.currency,
        razorpay_payment_id
      ).catch(e => logger.warn(`[mailer] payment-confirmation email failed: ${e.message}`));
    }

    audit.log(req, 'payment.captured', 'payment', payment._id, {
      plan: plan.name,
      amount: payment.amount,
      razorpayPaymentId: razorpay_payment_id,
    });

    logger.info(`[Razorpay] Payment verified & plan activated: ${razorpay_payment_id} → ${plan.name} for tenant ${tenant._id}`);

    return success(res, {
      planName: plan.displayName,
      subscriptionEnd: tenant.subscriptionEnd,
    }, `Subscription to ${plan.displayName} activated successfully!`);

  } catch (err) {
    logger.error(`[Razorpay] verifyPayment error: ${err.message}`);
    next(err);
  }
};

/**
 * POST /api/payments/failed
 * Called when user closes Razorpay checkout or payment fails on client
 */
exports.markFailed = async (req, res, next) => {
  try {
    const { razorpayOrderId, reason } = req.body;
    if (!razorpayOrderId) return error(res, 'Order ID required', 400);

    await Payment.findOneAndUpdate(
      { razorpayOrderId, tenantId: req.tenantId },
      { status: 'failed', failureReason: reason || 'User cancelled or payment failed', failedAt: new Date() }
    );

    return success(res, {}, 'Payment marked as failed');
  } catch (err) { next(err); }
};

/**
 * GET /api/payments/history
 * Returns payment history for the current tenant
 */
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const payments = await Payment.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('planId', 'displayName price billingCycle');

    return success(res, { payments });
  } catch (err) { next(err); }
};

/**
 * POST /api/payments/webhook
 * Razorpay webhook — verify signature and handle events
 * NOTE: This route must use raw body parser (not JSON) — set in routes file
 */
exports.handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest('hex');

      if (expectedSig !== signature) {
        logger.warn('[Razorpay Webhook] Invalid signature');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = req.body.event;
    const payload = req.body.payload;

    logger.info(`[Razorpay Webhook] Event: ${event}`);

    if (event === 'payment.captured') {
      const rzpPayment = payload?.payment?.entity;
      if (rzpPayment) {
        await Payment.findOneAndUpdate(
          { razorpayOrderId: rzpPayment.order_id },
          {
            razorpayPaymentId: rzpPayment.id,
            status: 'captured',
            capturedAt: new Date(),
            method: rzpPayment.method,
            rzpStatus: rzpPayment.status,
          }
        );
      }
    }

    if (event === 'payment.failed') {
      const rzpPayment = payload?.payment?.entity;
      if (rzpPayment) {
        await Payment.findOneAndUpdate(
          { razorpayOrderId: rzpPayment.order_id },
          {
            razorpayPaymentId: rzpPayment.id,
            status: 'failed',
            failedAt: new Date(),
            failureReason: rzpPayment.error_description || 'Payment failed',
          }
        );
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error(`[Razorpay Webhook] Error: ${err.message}`);
    return res.status(200).json({ received: true }); // Always 200 for webhooks
  }
};