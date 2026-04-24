const mongoose = require('mongoose');
const { Invoice, Notification, Client } = require('../models/index');
const Counter = require('../models/Counter.model');
const { success, error } = require('../utils/apiResponse');
const pdfService = require('../services/pdf.service');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');
const audit = require('../utils/audit');
const path = require('path');
const fs = require('fs');

const generateInvoiceNo = async (tenantId) => {
  const year = new Date().getFullYear();
  const key = `invoice-${tenantId.toString()}-${year}`;
  const seq = await Counter.nextSeq(key);
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
};

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

exports.createInvoice = async (req, res, next) => {
  try {
    const { clientId, items, taxRate = 0, discount = 0, dueDate, notes, currency = 'INR' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return error(res, 'At least one line item is required', 400);
    }

    const client = await Client.findOne({ _id: clientId, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount - discount;
    const invoiceNo = await generateInvoiceNo(req.tenantId);

    const invoice = await Invoice.create({
      invoiceNo,
      clientId,
      tenantId: req.tenantId,
      items: items.map(i => ({ ...i, total: i.unitPrice * i.quantity })),
      subtotal, taxRate, taxAmount, discount, total,
      dueDate: new Date(dueDate), notes, currency,
      createdBy: req.user._id,
      status: 'draft',
    });

    // ── Step 1: Generate PDF ──────────────────────────────────────────────
    let pdfAbsPath = null;
    try {
      const relativePath = await pdfService.generateInvoicePDF(invoice, client);
      invoice.pdfUrl = relativePath;
      pdfAbsPath = path.join(process.cwd(), relativePath);
      logger.info(`PDF generated: ${relativePath}`);
    } catch (pdfErr) {
      logger.error(`PDF generation failed for ${invoice.invoiceNo}: ${pdfErr.message}`);
    }

    // ── Step 2: Send email WITH PDF attachment ────────────────────────────
    try {
      await mailerService.sendInvoiceEmail(
        client.email,
        client.name,
        invoice.invoiceNo,
        invoice.total,
        invoice.dueDate,
        pdfAbsPath   // <-- pass the absolute path so mailer can attach it
      );
      invoice.status = 'sent';
    } catch (mailErr) {
      logger.error(`Invoice email failed for ${invoice.invoiceNo}: ${mailErr.message}`);
      invoice.status = 'pending';
    }

    await invoice.save();

    await Notification.create({
      tenantId: req.tenantId,
      type: 'info',
      title: 'Invoice Created',
      message: `Invoice ${invoice.invoiceNo} for ${client.name} — ₹${total}`,
      entityId: invoice._id, entityType: 'invoice', severity: 'info',
    });

    audit.log(req, 'invoice.create', 'invoice', invoice._id, {
      invoiceNo: invoice.invoiceNo,
      clientId: String(client._id),
      total: invoice.total,
    });

    await invoice.populate('clientId', 'name email company');
    return success(res, { invoice }, 'Invoice created', 201);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNo) {
      return error(res, 'Invoice number already exists for this account. Please try again.', 409);
    }
    next(err);
  }
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

    audit.log(req, `invoice.status-change`, 'invoice', invoice._id, {
      invoiceNo: invoice.invoiceNo,
      newStatus: status,
    });

    return success(res, { invoice }, `Invoice marked as ${status}`);
  } catch (err) { next(err); }
};

// @GET /api/billing/invoices/:id/pdf
exports.downloadPDF = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone company address');
    if (!invoice) return error(res, 'Invoice not found', 404);

    const pdfPath = invoice.pdfUrl ? path.join(process.cwd(), invoice.pdfUrl) : null;

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      // Regenerate if missing
      const client = await Client.findById(invoice.clientId);
      const newRelativePath = await pdfService.generateInvoicePDF(invoice, client);
      invoice.pdfUrl = newRelativePath;
      await invoice.save();
      return res.download(path.join(process.cwd(), newRelativePath), `${invoice.invoiceNo}.pdf`);
    }

    return res.download(pdfPath, `${invoice.invoiceNo}.pdf`);
  } catch (err) { next(err); }
};

// @GET /api/billing/summary
exports.getBillingSummary = async (req, res, next) => {
  try {
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
    audit.log(req, 'invoice.delete', 'invoice', invoice._id, { invoiceNo: invoice.invoiceNo });
    return success(res, {}, 'Invoice deleted');
  } catch (err) { next(err); }
};
