const { Coupon, Referral } = require('../models/coupon.model');
const Tenant = require('../models/Tenant.model');
const { success, error } = require('../utils/apiResponse');
const crypto = require('crypto');

const genReferralCode = (orgName = '') => {
    const base = orgName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'NV';
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${base}${rand}`;
};

//  COUPON 

// Public — no auth required (for register page)
exports.getPublicCoupons = async (req, res, next) => {
    try {
        const now = new Date();
        const coupons = await Coupon.find({
            isActive: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
            $or: [{ maxUses: null }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }],
        })
            .select('code description discountType discountValue minOrderAmount applicablePlans expiresAt')
            .sort({ createdAt: -1 });
        return success(res, { coupons });
    } catch (err) { next(err); }
};

exports.getCoupons = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.role === 'superAdmin';
        const query = isSuperAdmin ? {} : { isActive: true };
        const coupons = await Coupon.find(query).sort({ createdAt: -1 });
        return success(res, { coupons });
    } catch (err) { next(err); }
};

exports.createCoupon = async (req, res, next) => {
    try {
        const { code, description, discountType, discountValue, maxUses, minOrderAmount, applicablePlans, expiresAt } = req.body;
        if (!code || !discountType || !discountValue) {
            return error(res, 'code, discountType and discountValue are required', 400);
        }
        const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (existing) return error(res, 'Coupon code already exists', 409);
        const coupon = await Coupon.create({
            code: code.toUpperCase().trim(),
            description,
            discountType,
            discountValue,
            maxUses: maxUses || null,
            minOrderAmount: minOrderAmount || 0,
            applicablePlans: applicablePlans || [],
            expiresAt: expiresAt || null,
            createdBy: req.user._id,
        });
        return success(res, { coupon }, 'Coupon created', 201);
    } catch (err) { next(err); }
};

exports.getCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return error(res, 'Coupon not found', 404);
        return success(res, { coupon });
    } catch (err) { next(err); }
};

exports.updateCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!coupon) return error(res, 'Coupon not found', 404);
        return success(res, { coupon }, 'Coupon updated');
    } catch (err) { next(err); }
};

exports.deleteCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) return error(res, 'Coupon not found', 404);
        return success(res, {}, 'Coupon deleted');
    } catch (err) { next(err); }
};

exports.toggleCoupon = async (req, res, next) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return error(res, 'Coupon not found', 404);
        coupon.isActive = !coupon.isActive;
        await coupon.save();
        return success(res, { coupon }, `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`);
    } catch (err) { next(err); }
};

exports.validateCoupon = async (req, res, next) => {
    try {
        const { code, orderAmount = 0 } = req.body;
        if (!code) return error(res, 'Coupon code is required', 400);
        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) return error(res, 'Invalid coupon code', 404);

        // Validate
        if (!coupon.isActive) return error(res, 'Coupon is inactive', 400);
        if (coupon.expiresAt && new Date() > coupon.expiresAt) return error(res, 'Coupon has expired', 400);
        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return error(res, 'Coupon usage limit reached', 400);
        if (orderAmount < coupon.minOrderAmount) return error(res, `Minimum order amount is Rs ${coupon.minOrderAmount}`, 400);

        // Calculate discount
        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
        } else {
            discountAmount = Math.min(coupon.discountValue, orderAmount);
        }

        return success(res, {
            coupon: { _id: coupon._id, code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: coupon.discountValue },
            discountAmount,
            finalAmount: orderAmount - discountAmount,
        }, 'Coupon is valid');
    } catch (err) { next(err); }
};

// REFERRAL 

exports.getMyReferral = async (req, res, next) => {
    try {
        let referral = await Referral.findOne({ referrerTenantId: req.tenantId })
            .populate('referredTenants.tenantId', 'orgName createdAt');
        if (!referral) {
            const tenant = await Tenant.findById(req.tenantId);
            let code = genReferralCode(tenant?.orgName || '');
            let attempts = 0;
            while (await Referral.findOne({ referralCode: code }) && attempts < 5) {
                code = genReferralCode(tenant?.orgName || '');
                attempts++;
            }
            referral = await Referral.create({
                referrerTenantId: req.tenantId,
                referralCode: code,
                referrerReward: { type: 'flat', value: 500 },
                referredReward: { type: 'percentage', value: 10 },
            });
        }
        return success(res, { referral });
    } catch (err) { next(err); }
};

exports.getAllReferrals = async (req, res, next) => {
    try {
        const referrals = await Referral.find()
            .populate('referrerTenantId', 'orgName email')
            .populate('referredTenants.tenantId', 'orgName')
            .sort({ createdAt: -1 });
        return success(res, { referrals });
    } catch (err) { next(err); }
};

exports.applyReferral = async (req, res, next) => {
    try {
        const { referralCode, newTenantId } = req.body;
        if (!referralCode || !newTenantId) return error(res, 'referralCode and newTenantId required', 400);
        const referral = await Referral.findOne({ referralCode: referralCode.toUpperCase(), isActive: true });
        if (!referral) return error(res, 'Invalid referral code', 404);
        if (referral.referrerTenantId.toString() === newTenantId) return error(res, 'Cannot use your own referral code', 400);
        const alreadyUsed = referral.referredTenants.some(r => r.tenantId?.toString() === newTenantId);
        if (alreadyUsed) return error(res, 'Referral already applied', 400);
        referral.referredTenants.push({ tenantId: newTenantId, status: 'pending' });
        referral.totalReferrals += 1;
        await referral.save();
        return success(res, { referredReward: referral.referredReward }, 'Referral applied successfully');
    } catch (err) { next(err); }
};

exports.markRewarded = async (req, res, next) => {
    try {
        const { tenantId } = req.body;
        const referral = await Referral.findById(req.params.id);
        if (!referral) return error(res, 'Referral not found', 404);
        const entry = referral.referredTenants.find(r => r.tenantId?.toString() === tenantId);
        if (!entry) return error(res, 'Referred tenant not found', 404);
        entry.status = 'rewarded';
        referral.totalRewardEarned += referral.referrerReward.value;
        await referral.save();
        return success(res, { referral }, 'Marked as rewarded');
    } catch (err) { next(err); }
};