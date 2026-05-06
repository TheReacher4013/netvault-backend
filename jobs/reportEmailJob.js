
const cron = require('node-cron');
const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client, Invoice, ReportEmailSchedule } = require('../models/index');
const mailer = require('../services/mailer.service');
const logger = require('../utils/logger');




function getTodayRangeIST() {
  const now = new Date();
  // Get "YYYY-MM-DD" in IST
  const istStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = istStr.split('-').map(Number);

 
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const todayStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  return { todayStart, todayEnd };
}



const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtMoney = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
}) : '—';

const tableRow = (label, value, color = '#111827', note = '') => `
  <tr>
    <td style="padding:10px 16px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;line-height:1.4;">
      ${label}
      ${note ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${note}</div>` : ''}
    </td>
    <td style="padding:10px 16px;font-weight:700;font-size:15px;color:${color};text-align:right;border-bottom:1px solid #F3F4F6;">${value}</td>
  </tr>`;

const section = (title, icon, rows, badge = '') => `
  <div style="margin-bottom:28px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <h3 style="margin:0;font-size:14px;font-weight:700;color:#374151;">${icon} ${title}</h3>
      ${badge ? `<span style="background:#EFF6FF;color:#3B82F6;border:1px solid #BFDBFE;border-radius:999px;font-size:10px;font-weight:700;padding:2px 10px;">${badge}</span>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
      ${rows}
    </table>
  </div>`;

// ── Base HTML template ────────────────────────────────────────────────────────

const baseTemplate = (content, dateStr, dayStr) => `
<!DOCTYPE html><html>
<head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; background: #F3F4F6; margin: 0; padding: 20px; }
  .wrap { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.10); }
  .hdr  { background: linear-gradient(135deg, #0D2B1F, #1C4A34); padding: 28px 32px; }
  .hdr h1 { color: #2ECC8A; margin: 0; font-size: 22px; }
  .hdr p  { color: #A8C4B8; margin: 6px 0 0; font-size: 13px; }
  .body { padding: 28px 32px; }
  .banner { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: #1D4ED8; font-weight: 600; }
  .ftr  { padding: 18px 32px; background: #F9FAFB; border-top: 1px solid #E5E7EB; font-size: 12px; color: #9CA3AF; text-align: center; line-height: 1.7; }
</style>
</head>
<body>
<div class="wrap">
  ${content}
  <div class="ftr">
    NetVault — Automated Daily Report<br/>
    📅 Data shown is for <strong>${dayStr}, ${dateStr}</strong> (IST) only<br/>
    You received this because you subscribed to daily reports.
  </div>
</div>
</body></html>`;

// ── SUPER ADMIN report builder ────────────────────────────────────────────────

async function buildSuperAdminReport() {
  const { todayStart, todayEnd } = getTodayRangeIST();
  const todayFilter = { $gte: todayStart, $lt: todayEnd };
  const now = new Date();

  // Current platform snapshot
  const tenants = await Tenant.find().populate('adminId', 'name email').sort({ createdAt: -1 }).lean();
  const tenantIds = tenants.map(t => t._id);

  const [
    newTenantsToday,
    newDomainsToday,
    newClientsToday,
    newInvoicesToday,
    todayPaidRevenue,
    todayPendingCount,
    todayOverdueCount,
    suspendedCount,
    expiringPlans30,
    expiringDomains30,
  ] = await Promise.all([
    Tenant.countDocuments({ createdAt: todayFilter }),
    Domain.countDocuments({ tenantId: { $in: tenantIds }, createdAt: todayFilter }),
    Client.countDocuments({ tenantId: { $in: tenantIds }, createdAt: todayFilter }),
    Invoice.countDocuments({ tenantId: { $in: tenantIds }, createdAt: todayFilter }),
    // Revenue = invoices whose status changed to 'paid' today
    Invoice.aggregate([
      { $match: { tenantId: { $in: tenantIds }, status: 'paid', updatedAt: todayFilter } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Invoice.countDocuments({ tenantId: { $in: tenantIds }, status: 'pending', createdAt: todayFilter }),
    Invoice.countDocuments({ tenantId: { $in: tenantIds }, status: 'overdue', createdAt: todayFilter }),
    Tenant.countDocuments({ planStatus: 'suspended' }),
    Tenant.countDocuments({
      subscriptionEnd: { $gte: now, $lte: new Date(now.getTime() + 30 * 86400000) },
      planStatus: 'active',
    }),
    Domain.countDocuments({
      tenantId: { $in: tenantIds },
      expiryDate: { $gte: now, $lte: new Date(now.getTime() + 30 * 86400000) },
    }),
  ]);

  const revenueToday = todayPaidRevenue[0]?.total || 0;
  const active = tenants.filter(t => t.planStatus === 'active').length;

  // New tenants detail list
  const newTenantsList = await Tenant.find({ createdAt: todayFilter })
    .populate('adminId', 'name email').lean();

  const newTenantRows = newTenantsList.length
    ? newTenantsList.map(t => `
        <tr style="border-bottom:1px solid #F3F4F6;">
          <td style="padding:10px 16px;">
            <div style="font-weight:600;font-size:13px;color:#111827;">${t.orgName}</div>
            <div style="font-size:11px;color:#9CA3AF;">${t.adminId?.email || '—'}</div>
          </td>
          <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#6366F1;">${(t.planName || 'Free').toUpperCase()}</td>
          <td style="padding:10px 16px;font-size:11px;color:#6B7280;text-align:right;">${fmtDate(t.createdAt)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:20px;text-align:center;color:#9CA3AF;font-size:13px;">No new companies registered today</td></tr>`;

  const todaySection = section("Today's Activity", '📊',
    tableRow('New Companies', fmt(newTenantsToday), newTenantsToday > 0 ? '#6366F1' : '#111827') +
    tableRow('New Domains Added', fmt(newDomainsToday), newDomainsToday > 0 ? '#6366F1' : '#111827') +
    tableRow('New Clients Added', fmt(newClientsToday), newClientsToday > 0 ? '#6366F1' : '#111827') +
    tableRow('New Invoices Created', fmt(newInvoicesToday), newInvoicesToday > 0 ? '#6366F1' : '#111827') +
    tableRow('Revenue Collected', fmtMoney(revenueToday), '#16A34A', 'Invoices paid today') +
    tableRow('Pending Invoices Today', fmt(todayPendingCount), todayPendingCount > 0 ? '#D97706' : '#111827') +
    tableRow('Overdue Invoices Today', fmt(todayOverdueCount), todayOverdueCount > 0 ? '#DC2626' : '#111827'),
    'Today only · IST'
  );

  const snapshotSection = section('Platform Snapshot', '🏢',
    tableRow('Total Companies', fmt(tenants.length)) +
    tableRow('Active', fmt(active), '#16A34A') +
    tableRow('Suspended', fmt(suspendedCount), suspendedCount > 0 ? '#DC2626' : '#111827') +
    tableRow('Plans Expiring ≤30 days', fmt(expiringPlans30), expiringPlans30 > 0 ? '#D97706' : '#111827') +
    tableRow('Domains Expiring ≤30 days', fmt(expiringDomains30), expiringDomains30 > 0 ? '#D97706' : '#111827'),
    'Current state'
  );

  const newCompaniesSection = `
    <div style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <h3 style="margin:0;font-size:14px;font-weight:700;color:#374151;">🆕 New Companies Today</h3>
        <span style="background:#EFF6FF;color:#3B82F6;border:1px solid #BFDBFE;border-radius:999px;font-size:10px;font-weight:700;padding:2px 10px;">Today only · IST</span>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
        <thead><tr style="background:#F9FAFB;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Company</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Plan</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Time</th>
        </tr></thead>
        <tbody>${newTenantRows}</tbody>
      </table>
    </div>`;

  return { todaySection, snapshotSection, newCompaniesSection };
}

// ── ADMIN report builder ──────────────────────────────────────────────────────

async function buildAdminReport(tenantId) {
  const { todayStart, todayEnd } = getTodayRangeIST();
  const tid = tenantId;
  const now = new Date();
  const todayFilter = { $gte: todayStart, $lt: todayEnd };

  const [
    newDomainsToday,
    newHostingToday,
    newClientsToday,
    newInvoicesToday,
    todayInvoiceStats,
    todayPaidRevenue,
    // snapshot
    totalDomains,
    expiringDomains,
    expiredDomains,
    totalHosting,
    expiringHosting,
    totalClients,
    activeClients,
    staffCount,
    totalOverdueInv,
  ] = await Promise.all([
    Domain.countDocuments({ tenantId: tid, createdAt: todayFilter }),
    Hosting.countDocuments({ tenantId: tid, createdAt: todayFilter }),
    Client.countDocuments({ tenantId: tid, createdAt: todayFilter }),
    Invoice.countDocuments({ tenantId: tid, createdAt: todayFilter }),

    Invoice.aggregate([
      { $match: { tenantId: tid, createdAt: todayFilter } },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
    ]),
    Invoice.aggregate([
      { $match: { tenantId: tid, status: 'paid', updatedAt: todayFilter } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),

    Domain.countDocuments({ tenantId: tid }),
    Domain.countDocuments({ tenantId: tid, status: 'expiring' }),
    Domain.countDocuments({ tenantId: tid, status: 'expired' }),
    Hosting.countDocuments({ tenantId: tid }),
    Hosting.countDocuments({ tenantId: tid, status: 'expiring' }),
    Client.countDocuments({ tenantId: tid }),
    Client.countDocuments({ tenantId: tid, status: 'active' }),
    User.countDocuments({ tenantId: tid, role: { $in: ['admin', 'accountManager', 'technicalManager', 'billingManager', 'staff'] } }),
    Invoice.countDocuments({ tenantId: tid, status: 'overdue' }),
  ]);

  const byStatus = {};
  todayInvoiceStats.forEach(s => { byStatus[s._id] = { count: s.count, total: s.total }; });
  const revenueToday = todayPaidRevenue[0]?.total || 0;

  // New domains added today (max 5)
  const newDomainsList = await Domain.find({ tenantId: tid, createdAt: todayFilter })
    .sort({ createdAt: -1 }).limit(5).lean();

  const domainRows = newDomainsList.length
    ? newDomainsList.map(d => `
        <tr style="border-bottom:1px solid #F3F4F6;">
          <td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;">${d.domainName}</td>
          <td style="padding:9px 16px;font-size:12px;color:#6B7280;">${fmtDate(d.expiryDate)}</td>
          <td style="padding:9px 16px;font-size:11px;color:#6366F1;font-weight:700;text-align:right;">${(d.registrar || '—').toUpperCase()}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:20px;text-align:center;color:#9CA3AF;font-size:13px;">No new domains added today</td></tr>`;

  const todaySection = section("Today's Activity", '📊',
    tableRow('New Domains Added', fmt(newDomainsToday), newDomainsToday > 0 ? '#6366F1' : '#111827') +
    tableRow('New Hosting Added', fmt(newHostingToday), newHostingToday > 0 ? '#6366F1' : '#111827') +
    tableRow('New Clients Added', fmt(newClientsToday), newClientsToday > 0 ? '#6366F1' : '#111827') +
    tableRow('Invoices Created', fmt(newInvoicesToday), newInvoicesToday > 0 ? '#6366F1' : '#111827') +
    tableRow('Revenue Collected', fmtMoney(revenueToday), '#16A34A', 'Paid today') +
    tableRow('Invoices Paid Today', fmt(byStatus['paid']?.count || 0), '#16A34A') +
    tableRow('Invoices Pending Today', fmt(byStatus['pending']?.count || 0), byStatus['pending']?.count > 0 ? '#D97706' : '#111827') +
    tableRow('Invoices Overdue Today', fmt(byStatus['overdue']?.count || 0), byStatus['overdue']?.count > 0 ? '#DC2626' : '#111827'),
    'Today only · IST'
  );

  const snapshotSection = section('Current Snapshot', '📋',
    tableRow('Total Domains', fmt(totalDomains)) +
    tableRow('Expiring Soon', fmt(expiringDomains), expiringDomains > 0 ? '#D97706' : '#111827') +
    tableRow('Expired', fmt(expiredDomains), expiredDomains > 0 ? '#DC2626' : '#111827') +
    tableRow('Total Hosting Plans', fmt(totalHosting)) +
    tableRow('Hosting Expiring', fmt(expiringHosting), expiringHosting > 0 ? '#D97706' : '#111827') +
    tableRow('Total Clients', fmt(totalClients)) +
    tableRow('Active Clients', fmt(activeClients), '#16A34A') +
    tableRow('Team Members', fmt(staffCount)) +
    tableRow('Overdue Invoices (all)', fmt(totalOverdueInv), totalOverdueInv > 0 ? '#DC2626' : '#111827'),
    'As of today'
  );

  const newDomainsSection = `
    <div style="margin-bottom:28px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <h3 style="margin:0;font-size:14px;font-weight:700;color:#374151;">🌐 New Domains Added Today</h3>
        <span style="background:#EFF6FF;color:#3B82F6;border:1px solid #BFDBFE;border-radius:999px;font-size:10px;font-weight:700;padding:2px 10px;">Today only · IST</span>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
        <thead><tr style="background:#F9FAFB;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Domain</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Expiry</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Registrar</th>
        </tr></thead>
        <tbody>${domainRows}</tbody>
      </table>
    </div>`;

  return { todaySection, snapshotSection, newDomainsSection };
}

// ── Main send function ────────────────────────────────────────────────────────

exports.sendReportEmail = async (scope, tenantId = null) => {
  try {
    const query = scope === 'superAdmin'
      ? { scope: 'superAdmin', tenantId: null }
      : { scope: 'admin', tenantId };

    const schedule = await ReportEmailSchedule.findOne(query).lean();
    if (!schedule || !schedule.enabled || !schedule.emails?.length) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const dayStr = now.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });

    let bodyHtml;

    if (scope === 'superAdmin') {
      const { todaySection, snapshotSection, newCompaniesSection } = await buildSuperAdminReport();
      bodyHtml = baseTemplate(`
        <div class="hdr">
          <h1>🌐 NetVault</h1>
          <p>SuperAdmin Daily Report — ${dayStr}, ${dateStr}</p>
        </div>
        <div class="body">
          <div class="banner">📅 Today's Report &nbsp;·&nbsp; ${dayStr}, ${dateStr} &nbsp;·&nbsp; IST Timezone</div>
          ${todaySection}
          ${snapshotSection}
          ${newCompaniesSection}
        </div>`, dateStr, dayStr);
    } else {
      const tenant = await Tenant.findById(tenantId).lean();
      const { todaySection, snapshotSection, newDomainsSection } = await buildAdminReport(tenantId);
      bodyHtml = baseTemplate(`
        <div class="hdr">
          <h1>🌐 ${tenant?.orgName || 'NetVault'}</h1>
          <p>Daily Report — ${dayStr}, ${dateStr}</p>
        </div>
        <div class="body">
          <div class="banner">📅 Today's Report &nbsp;·&nbsp; ${dayStr}, ${dateStr} &nbsp;·&nbsp; IST Timezone</div>
          ${todaySection}
          ${snapshotSection}
          ${newDomainsSection}
        </div>`, dateStr, dayStr);
    }

    const subject = `📊 Daily Report — ${dateStr}`;

    for (const email of schedule.emails) {
      try {
        await mailer.sendMail(email, subject, bodyHtml);
        logger.info(`Report email sent to ${email} [${scope}]`);
      } catch (e) {
        logger.error(`Report email failed for ${email}: ${e.message}`);
      }
    }

    await ReportEmailSchedule.findOneAndUpdate(query, { lastSentAt: new Date() });
  } catch (err) {
    logger.error(`sendReportEmail error [${scope}]: ${err.message}`);
  }
};

// ── Cron ──────────────────────────────────────────────────────────────────────

exports.startReportEmailCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const hhmm = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
      }).replace(/^24/, '00').trim();

      const due = await ReportEmailSchedule.find({ enabled: true, sendTime: hhmm }).lean();
      for (const sched of due) {
        await exports.sendReportEmail(sched.scope, sched.tenantId);
      }
    } catch (err) {
      logger.error('Report cron error: ' + err.message);
    }
  });
  logger.info('Report email cron started');
};