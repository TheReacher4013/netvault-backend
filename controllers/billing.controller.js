const { Invoice, Notification } = require('../models/index');
const { Client } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const pdfService = require('../services/pdf.service');
const mailerService = require('../services/mailer.service');
const path = require('path');
const fs = require('fs');

// Generate invoice number
const generateInvoiceNo = async (tenantId) => {
  const count = await Invoice.countDocuments({ tenantId });
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
};

// @GET /api/billing/invoices
exports.getInvoices = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, clientId, search } = req.query;
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

    const invoiceNo = await generateInvoiceNo(req.tenantId);

    const invoice = await Invoice.create({
      invoiceNo, clientId, tenantId: req.tenantId,
      items: items.map(i => ({ ...i, total: i.unitPrice * i.quantity })),
      subtotal, taxRate, taxAmount, discount, total,
      dueDate: new Date(dueDate), notes, currency,
      createdBy: req.user._id,
      status: 'sent',
    });

    // Generate PDF
    const pdfPath = await pdfService.generateInvoicePDF(invoice, client);
    invoice.pdfUrl = pdfPath;
    await invoice.save();

    // Create notification
    await Notification.create({
      tenantId: req.tenantId,
      type: 'info',
      title: 'Invoice Created',
      message: `Invoice ${invoiceNo} for ${client.name} — ₹${total}`,
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
    const [totalRevenue, pending, overdue] = await Promise.all([
      Invoice.aggregate([
        { $match: { tenantId: req.tenantId, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { tenantId: req.tenantId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { tenantId: req.tenantId, status: 'overdue' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    // Monthly revenue last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthly = await Invoice.aggregate([
      { $match: { tenantId: req.tenantId, status: 'paid', paidAt: { $gte: sixMonthsAgo } } },
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
