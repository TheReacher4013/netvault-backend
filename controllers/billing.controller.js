const mongoose = require('mongoose');
const { Invoice, Notification, Client } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const pdfService = require('../services/pdf.service');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// ✅ FIX (Bug #6): Retry on duplicate key instead of silently crashing.
// Original used countDocuments() which is not atomic — two concurrent calls
// get the same count and generate the same invoice number.
const generateInvoiceNo = async (tenantId, attempt = 0) => {
  if (attempt > 5) throw new Error('Failed to generate a unique invoice number after retries');
  const count = await Invoice.countDocuments({ tenantId });
  const year = new Date().getFullYear();
  // Include attempt offset so retries produce a different number
  return `INV-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
};

// @GET /api/billing/invoices
exports.getInvoices = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, clientId } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status;
    if (clientId) query.clientId = clientId;

    const options = {
      page: parseInt(page), limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: { path: 'clientId', select: 'name email company' },
    };
    const result = await Invoice.paginate(query, options);
    return success(res, result);
  } catch (err) { next(err); }
};

// @POST /api/billing/invoices
exports.createInvoice = async (req, res, next) => {
  try {
    const { clientId, items, taxRate = 0, discount = 0, dueDate, notes, currency = 'INR' } = req.body;

    const client = await Client.findOne({ _id: clientId, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount - discount;

    // ✅ FIX (Bug #6): Retry loop for race condition on invoice number
    let invoice;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invoiceNo = await generateInvoiceNo(req.tenantId, attempt);
        // ✅ FIX (Bug #11): Create as 'draft' — promote to 'sent' only after email
        invoice = await Invoice.create({
          invoiceNo,
          clientId,
          tenantId: req.tenantId,
          items: items.map(i => ({ ...i, total: i.unitPrice * i.quantity })),
          subtotal, taxRate, taxAmount, discount, total,
          dueDate: new Date(dueDate), notes, currency,
          createdBy: req.user._id,
          status: 'draft', // not 'sent' yet
        });
        break;
      } catch (e) {
        if (e.code !== 11000) throw e; // only retry on duplicate key
        if (attempt === 4) throw new Error('Could not generate unique invoice number');
      }
    }

    // Generate PDF (non-blocking for response, but awaited for accuracy)
    try {
      const pdfPath = await pdfService.generateInvoicePDF(invoice, client);
      invoice.pdfUrl = pdfPath;
    } catch (pdfErr) {
      logger.error(`PDF generation failed for ${invoice.invoiceNo}: ${pdfErr.message}`);
      // Continue — PDF can be regenerated on download
    }

    // ✅ FIX (Bug #11): Only mark 'sent' if email dispatch succeeds
    try {
      await mailerService.sendInvoiceEmail(
        client.email, client.name,
        invoice.invoiceNo, invoice.total, invoice.dueDate
      );
      invoice.status = 'sent';
    } catch (mailErr) {
      logger.error(`Invoice email failed for ${invoice.invoiceNo}: ${mailErr.message}`);
      invoice.status = 'pending'; // email failed — leave as pending for manual resend
    }

    await invoice.save();

    await Notification.create({
      tenantId: req.tenantId,
      type: 'info',
      title: 'Invoice Created',
      message: `Invoice ${invoice.invoiceNo} for ${client.name} — ₹${total}`,
      entityId: invoice._id, entityType: 'invoice', severity: 'info',
    });

    await invoice.populate('clientId', 'name email company');
    return success(res, { invoice }, 'Invoice created', 201);
  } catch (err) { next(err); }
};

// @GET /api/billing/invoices/:id
exports.getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone company address')
      .populate('createdBy', 'name');
    if (!invoice) return error(res, 'Invoice not found', 404);
    return success(res, { invoice });
  } catch (err) { next(err); }
};

// @PATCH /api/billing/invoices/:id/status
exports.updateInvoiceStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const VALID_STATUSES = ['draft', 'sent', 'paid', 'pending', 'overdue', 'cancelled'];
    if (!VALID_STATUSES.includes(status)) {
      return error(res, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { status, ...(status === 'paid' && { paidAt: new Date() }) },
      { new: true }
    ).populate('clientId', 'name email');

    if (!invoice) return error(res, 'Invoice not found', 404);

    if (status === 'paid') {
      await Notification.create({
        tenantId: req.tenantId,
        type: 'payment_received',
        title: 'Payment Received',
        message: `Invoice ${invoice.invoiceNo} marked as paid — ₹${invoice.total}`,
        entityId: invoice._id, entityType: 'invoice', severity: 'success',
      });
    }

    return success(res, { invoice }, `Invoice marked as ${status}`);
  } catch (err) { next(err); }
};

// @GET /api/billing/invoices/:id/pdf  — Download PDF
exports.downloadPDF = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone company address');
    if (!invoice) return error(res, 'Invoice not found', 404);

    const pdfPath = invoice.pdfUrl
      ? path.join(__dirname, '..', invoice.pdfUrl)
      : null;

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      // Regenerate if missing
      const client = await Client.findById(invoice.clientId);
      const newPath = await pdfService.generateInvoicePDF(invoice, client);
      invoice.pdfUrl = newPath;
      await invoice.save();
      return res.download(path.join(__dirname, '..', newPath));
    }

    return res.download(pdfPath);
  } catch (err) { next(err); }
};

// @GET /api/billing/summary
exports.getBillingSummary = async (req, res, next) => {
  try {
    // ✅ FIX (Bug #3): Cast tenantId to ObjectId for aggregate $match.
    // Mongoose find()/countDocuments() auto-coerce strings to ObjectId,
    // but aggregate $match does NOT — it would silently return 0 for all stats.
    const tenantObjId = new mongoose.Types.ObjectId(req.tenantId);

    const [totalRevenue, pending, overdue] = await Promise.all([
      Invoice.aggregate([
        { $match: { tenantId: tenantObjId, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { tenantId: tenantObjId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { tenantId: tenantObjId, status: 'overdue' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthly = await Invoice.aggregate([
      { $match: { tenantId: tenantObjId, status: 'paid', paidAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } }, total: { $sum: '$total' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return success(res, {
      totalRevenue: totalRevenue[0]?.total || 0,
      pending: pending[0]?.total || 0,
      overdue: overdue[0]?.total || 0,
      monthly,
    });
  } catch (err) { next(err); }
};

// @DELETE /api/billing/invoices/:id
exports.deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!invoice) return error(res, 'Invoice not found', 404);
    return success(res, {}, 'Invoice deleted');
  } catch (err) { next(err); }
};
