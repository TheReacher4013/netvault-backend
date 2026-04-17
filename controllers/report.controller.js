const mongoose = require('mongoose');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client, Invoice } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

// @GET /api/reports/renewals?days=30
exports.getRenewalReport = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const now = new Date();

    // find() auto-coerces tenantId string to ObjectId — these are fine as-is
    const [domains, hosting] = await Promise.all([
      Domain.find({ tenantId: req.tenantId, expiryDate: { $gte: now, $lte: futureDate } })
        .populate('clientId', 'name email phone').sort({ expiryDate: 1 }),
      Hosting.find({ tenantId: req.tenantId, expiryDate: { $gte: now, $lte: futureDate } })
        .populate('clientId', 'name email phone').sort({ expiryDate: 1 }),
    ]);

    const sslExpiring = await Hosting.find({
      tenantId: req.tenantId,
      'ssl.expiryDate': { $gte: now, $lte: futureDate },
    }).populate('clientId', 'name email').sort({ 'ssl.expiryDate': 1 });

    return success(res, { domains, hosting, sslExpiring, days });
  } catch (err) { next(err); }
};

// @GET /api/reports/revenue
exports.getRevenueReport = async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    // ✅ FIX (Bug #3): Cast tenantId to ObjectId for all aggregate $match stages.
    // Mongoose aggregate does NOT auto-coerce strings — without this, every
    // $match returns 0 documents and all chart data is silently empty.
    const tenantObjId = new mongoose.Types.ObjectId(req.tenantId);

    const revenue = await Invoice.aggregate([
      { $match: { tenantId: tenantObjId, status: 'paid', paidAt: { $gte: startDate } } },
      {
        $group: {
          _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } },
          revenue: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const domainCosts = await Domain.aggregate([
      { $match: { tenantId: tenantObjId, renewalCost: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, totalCost: { $sum: '$renewalCost' } } },
    ]);

    const hostingCosts = await Hosting.aggregate([
      { $match: { tenantId: tenantObjId, renewalCost: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, totalCost: { $sum: '$renewalCost' } } },
    ]);

    return success(res, {
      monthly: revenue,
      totalExpenses: (domainCosts[0]?.totalCost || 0) + (hostingCosts[0]?.totalCost || 0),
    });
  } catch (err) { next(err); }
};

// @GET /api/reports/status-overview
exports.getStatusOverview = async (req, res, next) => {
  try {
    // ✅ FIX (Bug #3): Cast tenantId to ObjectId for aggregate stages
    const tenantObjId = new mongoose.Types.ObjectId(req.tenantId);

    const [domainStats, hostingStats, clientCount, invoiceStats] = await Promise.all([
      Domain.aggregate([
        { $match: { tenantId: tenantObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Hosting.aggregate([
        { $match: { tenantId: tenantObjId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // countDocuments auto-coerces — no ObjectId cast needed
      Client.countDocuments({ tenantId: req.tenantId, isActive: true }),
      Invoice.aggregate([
        { $match: { tenantId: tenantObjId } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
      ]),
    ]);

    const toMap = (arr) => arr.reduce((acc, i) => { acc[i._id] = i.count; return acc; }, {});

    return success(res, {
      domains: toMap(domainStats),
      hosting: toMap(hostingStats),
      clients: clientCount,
      invoices: invoiceStats.reduce((acc, i) => {
        acc[i._id] = { count: i.count, total: i.total };
        return acc;
      }, {}),
    });
  } catch (err) { next(err); }
};

// @GET /api/reports/client/:id
exports.getClientReport = async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const [client, domains, hosting, invoices] = await Promise.all([
      Client.findOne({ _id: clientId, tenantId: req.tenantId }),
      Domain.find({ clientId, tenantId: req.tenantId }).sort({ expiryDate: 1 }),
      Hosting.find({ clientId, tenantId: req.tenantId }).sort({ expiryDate: 1 }),
      Invoice.find({ clientId, tenantId: req.tenantId }).sort({ createdAt: -1 }),
    ]);
    if (!client) return error(res, 'Client not found', 404);

    const totalBilled = invoices.reduce((s, i) => s + i.total, 0);
    const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);

    return success(res, {
      client, domains, hosting, invoices,
      summary: { totalBilled, totalPaid, outstanding: totalBilled - totalPaid },
    });
  } catch (err) { next(err); }
};
