/**
 * reportEmailJob.js
 * Runs every minute, checks which schedules are due at the current HH:MM,
 * collects report data, and sends HTML emails to all registered recipients.
 */
const cron = require('node-cron');
const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client, Invoice, ReportEmailSchedule } = require('../models/index');
const mailer = require('../services/mailer.service');
const logger = require('../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const fmtMoney = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const tableRow = (label, value, color = '#111827') =>
  `<tr>
    <td style="padding:8px 12px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;">${label}</td>
    <td style="padding:8px 12px;font-weight:700;font-size:14px;color:${color};text-align:right;border-bottom:1px solid #F3F4F6;">${value}</td>
  </tr>`;

const section = (title, icon, rows) => `
  <div style="margin-bottom:24px;">
    <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;">
      ${icon} ${title}
    </h3>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E5E7EB;">
      ${rows}
    </table>
  </div>`;

// ── SuperAdmin report builder ─────────────────────────────────────────────────

async function buildSuperAdminReport() {
  const tenants = await Tenant.find().populate('adminId', 'name email').sort({ createdAt: -1 }).lean();
  const tenantIds = tenants.map(t => t._id);
  const now = new Date();

  const [domainCounts, clientCounts, invoiceCounts] = await Promise.all([
    Domain.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
    Client.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { tenantId: { $in: tenantIds } } }, { $group: { _id: '$tenantId', total: { $sum: '$total' } } }]),
  ]);

  const dcMap = Object.fromEntries(domainCounts.map(x => [x._id.toString(), x.count]));
  const clMap = Object.fromEntries(clientCounts.map(x => [x._id.toString(), x.count]));
  const revMap = Object.fromEntries(invoiceCounts.map(x => [x._id.toString(), x.total]));

  const active = tenants.filter(t => t.planStatus === 'active').length;
  const suspended = tenants.filter(t => t.planStatus === 'suspended').length;
  const expiring = tenants.filter(t => {
    if (!t.subscriptionEnd) return false;
    const d = Math.ceil((new Date(t.subscriptionEnd) - now) / 86400000);
    return d <= 30 && d > 0;
  }).length;

  const totalRevenue = Object.values(revMap).reduce((s, v) => s + v, 0);

  // Build company rows for the table
  const companyRows = tenants.slice(0, 20).map(t => {
    const id = t._id.toString();
    const subEnd = t.subscriptionEnd ? fmtDate(t.subscriptionEnd) : 'No expiry';
    const daysLeft = t.subscriptionEnd
      ? Math.ceil((new Date(t.subscriptionEnd) - now) / 86400000) : null;
    const statusColor = t.planStatus === 'active' ? '#16A34A' : t.planStatus === 'suspended' ? '#DC2626' : '#D97706';

    return `<tr style="border-bottom:1px solid #F3F4F6;">
      <td style="padding:10px 12px;font-size:13px;">
        <div style="font-weight:600;color:#111827;">${t.orgName}</div>
        <div style="font-size:11px;color:#9CA3AF;">${t.adminId?.email || '—'}</div>
      </td>
      <td style="padding:10px 12px;font-size:12px;font-weight:700;color:${statusColor};">${(t.planName || 'Free').toUpperCase()}</td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;">${subEnd}${daysLeft != null && daysLeft <= 30 ? ` <span style="color:#DC2626;">(${daysLeft}d)</span>` : ''}</td>
      <td style="padding:10px 12px;font-size:12px;text-align:right;color:#374151;">${fmt(dcMap[id])} domains · ${fmt(clMap[id])} clients</td>
    </tr>`;
  }).join('');

  const summarySection = section('Platform Summary', '🏢',
    tableRow('Total Companies', fmt(tenants.length)) +
    tableRow('Active', fmt(active), '#16A34A') +
    tableRow('Suspended', fmt(suspended), '#DC2626') +
    tableRow('Expiring Soon (≤30d)', fmt(expiring), '#D97706') +
    tableRow('Total Revenue (all time)', fmtMoney(totalRevenue), '#6366F1')
  );

  const companySection = `
    <div style="margin-bottom:24px;">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;">🏢 Companies (latest ${Math.min(tenants.length, 20)})</h3>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E5E7EB;font-size:13px;min-width:500px;">
          <thead>
            <tr style="background:#F9FAFB;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Company</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Plan</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Expiry</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;">Resources</th>
            </tr>
          </thead>
          <tbody>${companyRows}</tbody>
        </table>
      </div>
    </div>`;

  return { summarySection, companySection };
}

// ── Admin report builder ──────────────────────────────────────────────────────

async function buildAdminReport(tenantId) {
  const tid = tenantId;
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalDomains, expiringDomains, expiredDomains,
    totalHosting, expiringHosting,
    totalClients, activeClients,
    staffCount,
    invoiceStats,
    monthRevenue,
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
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } },
    ]),
    Invoice.aggregate([
      { $match: { tenantId: tid, status: 'paid', createdAt: { $gte: month } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ]);

  const invByStatus = {};
  invoiceStats.forEach(s => { invByStatus[s._id] = { count: s.count, total: s.total }; });
  const totalRevenue = invByStatus['paid']?.total || 0;
  const overdueRevenue = invByStatus['overdue']?.total || 0;
  const thisMonthRev = monthRevenue[0]?.total || 0;

  const domainSection = section('Domains', '🌐',
    tableRow('Total Domains', fmt(totalDomains)) +
    tableRow('Expiring Soon', fmt(expiringDomains), '#D97706') +
    tableRow('Expired', fmt(expiredDomains), '#DC2626')
  );

  const hostingSection = section('Hosting', '🖥️',
    tableRow('Total Hosting Plans', fmt(totalHosting)) +
    tableRow('Expiring Soon', fmt(expiringHosting), '#D97706')
  );

  const clientSection = section('Clients & Staff', '👥',
    tableRow('Total Clients', fmt(totalClients)) +
    tableRow('Active Clients', fmt(activeClients), '#16A34A') +
    tableRow('Total Staff', fmt(staffCount))
  );

  const billingSection = section('Billing & Revenue', '💰',
    tableRow('Total Invoices', fmt(Object.values(invByStatus).reduce((s, x) => s + x.count, 0))) +
    tableRow('Paid', fmt(invByStatus['paid']?.count || 0), '#16A34A') +
    tableRow('Pending', fmt(invByStatus['pending']?.count || 0), '#D97706') +
    tableRow('Overdue', fmt(invByStatus['overdue']?.count || 0), '#DC2626') +
    tableRow('Total Revenue', fmtMoney(totalRevenue), '#6366F1') +
    tableRow('This Month', fmtMoney(thisMonthRev), '#6366F1') +
    tableRow('Overdue Amount', fmtMoney(overdueRevenue), '#DC2626')
  );

  return { domainSection, hostingSection, clientSection, billingSection };
}

// ── Email sender ──────────────────────────────────────────────────────────────

const baseTemplate = (content) => `
<!DOCTYPE html><html>
<head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#F3F4F6;margin:0;padding:20px;}
  .wrap{max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
  .hdr{background:linear-gradient(135deg,#0D2B1F,#1C4A34);padding:28px 32px;}
  .hdr h1{color:#2ECC8A;margin:0;font-size:22px;}
  .hdr p{color:#A8C4B8;margin:4px 0 0;font-size:13px;}
  .body{padding:28px 32px;}
  .meta{background:#F9FAFB;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:12px;color:#6B7280;}
  .ftr{padding:18px 32px;background:#F9FAFB;border-top:1px solid #E5E7EB;font-size:12px;color:#9CA3AF;text-align:center;}
</style>
</head>
<body><div class="wrap">${content}</div></body></html>`;

async function sendReportEmailToList(emails, subject, htmlBody) {
  const { default: nodemailer } = await import('nodemailer').catch(() => ({ default: require('nodemailer') }));
  // Use mailer's sendMail via dynamic require to avoid circular issues
  const mailerSvc = require('../services/mailer.service');
  for (const email of emails) {
    try {
      await mailerSvc.sendMail
        ? mailerSvc.sendMail(email, subject, htmlBody)
        : mailerSvc._send(email, subject, htmlBody);
    } catch (_) { /* sendMail is unexported — call via internal */ }
  }
}

// ── Main send function (exported so controller can call it for test) ───────────

exports.sendReportEmail = async (scope, tenantId = null) => {
  try {
    const query = scope === 'superAdmin'
      ? { scope: 'superAdmin', tenantId: null }
      : { scope: 'admin', tenantId };

    const schedule = await ReportEmailSchedule.findOne(query).lean();
    if (!schedule || !schedule.enabled || !schedule.emails?.length) return;

    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let bodyHtml;
    if (scope === 'superAdmin') {
      const { summarySection, companySection } = await buildSuperAdminReport();
      bodyHtml = baseTemplate(`
        <div class="hdr"><h1>🌐 NetVault</h1><p>SuperAdmin Daily Report — ${dateStr}</p></div>
        <div class="body">
          <div class="meta">📅 Generated on ${dateStr} · SuperAdmin Platform Report</div>
          ${summarySection}
          ${companySection}
        </div>
        <div class="ftr">NetVault — Automated Daily Report · This email was sent to you because you are subscribed to daily reports.</div>
      `);
    } else {
      const tenant = await Tenant.findById(tenantId).lean();
      const { domainSection, hostingSection, clientSection, billingSection } = await buildAdminReport(tenantId);
      bodyHtml = baseTemplate(`
        <div class="hdr"><h1>🌐 NetVault</h1><p>${tenant?.orgName || 'Admin'} — Daily Report · ${dateStr}</p></div>
        <div class="body">
          <div class="meta">📅 Generated on ${dateStr} · ${tenant?.orgName || ''} Dashboard Report</div>
          ${domainSection}
          ${hostingSection}
          ${clientSection}
          ${billingSection}
        </div>
        <div class="ftr">NetVault — Automated Daily Report · This email was sent to you because you are subscribed to daily reports.</div>
      `);
    }

    const subject = scope === 'superAdmin'
      ? `📊 NetVault Platform Report — ${new Date().toLocaleDateString('en-IN')}`
      : `📊 Daily Report — ${new Date().toLocaleDateString('en-IN')}`;

    // Send to all recipients
    const mailerSvc = require('../services/mailer.service');
    for (const email of schedule.emails) {
      try {
        await mailerSvc.sendMail(email, subject, bodyHtml);
        logger.info(`Report email sent to ${email} [${scope}]`);
      } catch (e) {
        logger.error(`Report email failed for ${email}: ${e.message}`);
      }
    }

    // Update lastSentAt
    await ReportEmailSchedule.findOneAndUpdate(query, { lastSentAt: new Date() });
  } catch (err) {
    logger.error(`sendReportEmail error [${scope}]: ${err.message}`);
  }
};

// ── Cron: runs every minute, fires when HH:MM matches schedule ────────────────

exports.startReportEmailCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      // Format current time as HH:MM in IST (Asia/Kolkata = UTC+5:30)
      const hhmm = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
      }).replace(/^24/, '00').trim();

      // Find all enabled schedules where sendTime matches current HH:MM
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