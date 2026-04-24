const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client, Invoice, Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const path = require('path');
const fs = require('fs');
const pdfService = require('../services/pdf.service');


const getLinkedClient = async (req) => {
  if (!req.user || req.user.role !== 'client') return null;

  
  if (req.user.clientId) {
    const c = await Client.findOne({ _id: req.user.clientId, tenantId: req.user.tenantId });
    if (c) return c;
  }


  return await Client.findOne({
    email: req.user.email.toLowerCase(),
    tenantId: req.user.tenantId,
  });
};


const resolveOr404 = async (req, res) => {
  const client = await getLinkedClient(req);
  if (!client) {
    error(res, 'Your account is not linked to a client record. Contact your agency.', 403);
    return null;
  }
  return client;
};

// ── Overview ────────────────────────────────────────────────────────────────
// @GET /api/client-portal/overview
exports.getOverview = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);

    const [domains, hosting, invoices, expiringDomains] = await Promise.all([
      Domain.countDocuments({ tenantId: client.tenantId, clientId: client._id }),
      Hosting.countDocuments({ tenantId: client.tenantId, clientId: client._id }),
      Invoice.find({ tenantId: client.tenantId, clientId: client._id })
        .sort({ createdAt: -1 }).limit(5),
      Domain.find({
        tenantId: client.tenantId,
        clientId: client._id,
        expiryDate: { $gte: now, $lte: soon },
      }).sort({ expiryDate: 1 }),
    ]);

    const outstanding = invoices
      .filter(i => ['pending', 'overdue', 'sent'].includes(i.status))
      .reduce((s, i) => s + i.total, 0);

    return success(res, {
      client: {
        _id: client._id, name: client.name, email: client.email,
        company: client.company, phone: client.phone,
      },
      counts: { domains, hosting, recentInvoices: invoices.length },
      expiringDomains,
      recentInvoices: invoices,
      outstanding,
    });
  } catch (err) { next(err); }
};

// ── Domains (read-only) ─────────────────────────────────────────────────────
// @GET /api/client-portal/domains
exports.getDomains = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    const domains = await Domain.find({
      tenantId: client.tenantId,
      clientId: client._id,
    })
      .select('-whois.rawData -dnsRecords.value -sellingPrice -renewalCost')   // trim sensitive/cost data
      .sort({ expiryDate: 1 });

    return success(res, { domains });
  } catch (err) { next(err); }
};

// ── Hosting (read-only) — without credentials ───────────────────────────────
// @GET /api/client-portal/hosting
exports.getHosting = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    const hosting = await Hosting.find({
      tenantId: client.tenantId,
      clientId: client._id,
    })
      .select('label planType provider serverLocation expiryDate status uptime ssl autoRenewal')
      //  ^ deliberately excludes _cpanelInfoEncrypted, renewalCost, and serverIP
      //  (clients shouldn't see agency's cost or control-panel login)
      .sort({ expiryDate: 1 });

    return success(res, { hosting });
  } catch (err) { next(err); }
};

// ── Invoices (read-only) + PDF download for own invoices only ──────────────
// @GET /api/client-portal/invoices
exports.getInvoices = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    const { status } = req.query;
    const query = { tenantId: client.tenantId, clientId: client._id };
    if (status) query.status = status;

    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    return success(res, { invoices });
  } catch (err) { next(err); }
};

// @GET /api/client-portal/invoices/:id
exports.getInvoice = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      tenantId: client.tenantId,
      clientId: client._id,   // critical: ensures client cannot view others' invoices
    });
    if (!invoice) return error(res, 'Invoice not found', 404);

    return success(res, { invoice });
  } catch (err) { next(err); }
};

// @GET /api/client-portal/invoices/:id/pdf
exports.downloadInvoicePDF = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      tenantId: client.tenantId,
      clientId: client._id,
    });
    if (!invoice) return error(res, 'Invoice not found', 404);

    const pdfPath = invoice.pdfUrl ? path.join(__dirname, '..', invoice.pdfUrl) : null;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      const newPath = await pdfService.generateInvoicePDF(invoice, client);
      invoice.pdfUrl = newPath;
      await invoice.save();
      return res.download(path.join(__dirname, '..', newPath));
    }
    return res.download(pdfPath);
  } catch (err) { next(err); }
};

// ── Alerts — only this client's notifications ───────────────────────────────
// @GET /api/client-portal/alerts
exports.getAlerts = async (req, res, next) => {
  try {
    const client = await resolveOr404(req, res);
    if (!client) return;

    // Strategy: fetch notifications belonging to this client's entities
    // (their domains, hosting, invoices)
    const [domainIds, hostingIds, invoiceIds] = await Promise.all([
      Domain.find({ tenantId: client.tenantId, clientId: client._id }).distinct('_id'),
      Hosting.find({ tenantId: client.tenantId, clientId: client._id }).distinct('_id'),
      Invoice.find({ tenantId: client.tenantId, clientId: client._id }).distinct('_id'),
    ]);

    const notifications = await Notification.find({
      tenantId: client.tenantId,
      entityId: { $in: [...domainIds, ...hostingIds, ...invoiceIds] },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return success(res, { notifications });
  } catch (err) { next(err); }
};
