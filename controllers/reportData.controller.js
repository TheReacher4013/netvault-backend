const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client, Invoice, ReportEmailSchedule } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

exports.getSuperAdminSummary = async (req, res, next) => {
  try {
    if (req.user?.role !== 'superAdmin') return error(res, 'Forbidden', 403);

    const tenants = await Tenant.find()
      .populate('adminId', 'name email')
      .populate('planId', 'name price')
      .sort({ createdAt: -1 })
      .lean();

    const tenantIds = tenants.map(t => t._id);

    const [domainCounts, hostingCounts, clientCounts, userCounts, invoiceCounts] = await Promise.all([
      Domain.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
      Hosting.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
      Client.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { tenantId: { $in: tenantIds }, role: { $ne: 'client' } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    ]);

    const toMap = (arr, key = 'count') => Object.fromEntries(arr.map(x => [x._id.toString(), x[key]]));
    const dcMap = toMap(domainCounts);
    const hcMap = toMap(hostingCounts);
    const clMap = toMap(clientCounts);
    const ucMap = toMap(userCounts);
    const invMap = toMap(invoiceCounts, 'total');
    const invCMap = toMap(invoiceCounts, 'count');

    const companies = tenants.map(t => {
      const id = t._id.toString();
      const subEnd = t.subscriptionEnd ? new Date(t.subscriptionEnd) : null;
      const today = new Date();
      const daysLeft = subEnd ? Math.ceil((subEnd - today) / 86400000) : null;

      return {
        _id: t._id,
        orgName: t.orgName,
        adminName: t.adminId?.name || '—',
        adminEmail: t.adminId?.email || '—',
        planName: t.planName || 'Free',
        planStatus: t.planStatus || 'active',
        subscriptionStart: t.subscriptionStart,
        subscriptionEnd: t.subscriptionEnd,
        daysLeft,
        isExpired: subEnd ? subEnd < today : false,
        isExpiring: daysLeft != null && daysLeft <= 30 && daysLeft > 0,
        isActive: t.isActive,
        domains: dcMap[id] || 0,
        hosting: hcMap[id] || 0,
        clients: clMap[id] || 0,
        staff: ucMap[id] || 0,
        invoices: invCMap[id] || 0,
        revenue: invMap[id] || 0,
        createdAt: t.createdAt,
      };
    });

    // Platform-level totals
    const totals = {
      companies: companies.length,
      active: companies.filter(c => c.planStatus === 'active').length,
      suspended: companies.filter(c => c.planStatus === 'suspended').length,
      expiringSoon: companies.filter(c => c.isExpiring).length,
      expired: companies.filter(c => c.isExpired).length,
      totalDomains: companies.reduce((s, c) => s + c.domains, 0),
      totalHosting: companies.reduce((s, c) => s + c.hosting, 0),
      totalClients: companies.reduce((s, c) => s + c.clients, 0),
      totalRevenue: companies.reduce((s, c) => s + c.revenue, 0),
    };

    return success(res, { companies, totals });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — tenant-level stats
// GET /api/report-data/admin-summary
// ─────────────────────────────────────────────────────────────────────────────
exports.getAdminSummary = async (req, res, next) => {
  try {
    const tid = req.tenantId;

    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalDomains, expiringDomains, expiredDomains,
      totalHosting, expiringHosting,
      totalClients, activeClients,
      staffUsers,
      invoiceStats,
      monthRevenue, prevRevenue,
      recentDomains, recentClients,
    ] = await Promise.all([
      Domain.countDocuments({ tenantId: tid }),
      Domain.countDocuments({ tenantId: tid, status: 'expiring' }),
      Domain.countDocuments({ tenantId: tid, status: 'expired' }),
      Hosting.countDocuments({ tenantId: tid }),
      Hosting.countDocuments({ tenantId: tid, status: 'expiring' }),
      Client.countDocuments({ tenantId: tid }),
      Client.countDocuments({ tenantId: tid, status: 'active' }),
      User.countDocuments({ tenantId: tid, role: { $in: ['admin', 'staff'] } }),
      Invoice.aggregate([
        { $match: { tenantId: tid } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$total' },
          }
        },
      ]),
      Invoice.aggregate([
        { $match: { tenantId: tid, status: 'paid', createdAt: { $gte: month } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { tenantId: tid, status: 'paid', createdAt: { $gte: prev, $lt: month } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Domain.find({ tenantId: tid }).sort({ createdAt: -1 }).limit(5).select('name status expiryDate').lean(),
      Client.find({ tenantId: tid }).sort({ createdAt: -1 }).limit(5).select('name email status').lean(),
    ]);

    // Invoice breakdown
    const invByStatus = {};
    invoiceStats.forEach(s => { invByStatus[s._id] = { count: s.count, total: s.total }; });
    const totalInvoices = invoiceStats.reduce((s, x) => s + x.count, 0);
    const totalRevenue = (invByStatus['paid']?.total || 0);
    const overdueRevenue = (invByStatus['overdue']?.total || 0);
    const pendingRevenue = (invByStatus['pending']?.total || 0);
    const thisMonthRev = monthRevenue[0]?.total || 0;
    const prevMonthRev = prevRevenue[0]?.total || 0;
    const revenueGrowth = prevMonthRev > 0
      ? (((thisMonthRev - prevMonthRev) / prevMonthRev) * 100).toFixed(1)
      : null;

    return success(res, {
      domains: { total: totalDomains, expiring: expiringDomains, expired: expiredDomains },
      hosting: { total: totalHosting, expiring: expiringHosting },
      clients: { total: totalClients, active: activeClients },
      staff: { total: staffUsers },
      invoices: {
        total: totalInvoices,
        paid: invByStatus['paid']?.count || 0,
        pending: invByStatus['pending']?.count || 0,
        overdue: invByStatus['overdue']?.count || 0,
        draft: invByStatus['draft']?.count || 0,
        totalRevenue, overdueRevenue, pendingRevenue,
        thisMonthRevenue: thisMonthRev,
        prevMonthRevenue: prevMonthRev,
        revenueGrowth,
      },
      recentDomains,
      recentClients,
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SCHEDULE — GET, UPSERT, TEST
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/report-data/email-schedule
exports.getEmailSchedule = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'superAdmin';
    const query = isSuperAdmin
      ? { scope: 'superAdmin', tenantId: null }
      : { scope: 'admin', tenantId: req.tenantId };

    const schedule = await ReportEmailSchedule.findOne(query).lean();
    return success(res, { schedule: schedule || null });
  } catch (err) { next(err); }
};

// POST /api/report-data/email-schedule  (upsert)
exports.saveEmailSchedule = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'superAdmin';
    const { emails, sendTime, enabled } = req.body;

    // Validate emails
    const validEmails = (emails || [])
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    const filter = isSuperAdmin
      ? { scope: 'superAdmin', tenantId: null }
      : { scope: 'admin', tenantId: req.tenantId };

    const update = {
      ...filter,
      emails: validEmails,
      sendTime: sendTime || '18:00',
      enabled: enabled !== false,
    };

    const schedule = await ReportEmailSchedule.findOneAndUpdate(
      filter, update, { upsert: true, new: true, runValidators: true }
    );
    return success(res, { schedule }, 'Email schedule saved');
  } catch (err) { next(err); }
};

// POST /api/report-data/email-schedule/test  (send immediately)
exports.testEmailSchedule = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'superAdmin';
    const { sendReportEmail } = require('../jobs/reportEmailJob');
    await sendReportEmail(isSuperAdmin ? 'superAdmin' : 'admin', req.tenantId);
    return success(res, {}, 'Test report sent');
  } catch (err) { next(err); }
};