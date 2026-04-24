const cron = require('node-cron');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const { Notification } = require('../models/index');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');

// Runs every day at 8:00 AM UTC
cron.schedule('0 8 * * *', async () => {
  logger.info('Running expiry checker cron job...');
  try {
    await checkDomainExpiry();
    await checkHostingExpiry();
    await checkSSLExpiry();
    logger.info('Expiry checker completed.');
  } catch (err) {
    logger.error(`Expiry checker error: ${err.message}`);
  }
});

const getTenantContext = async (tenantId) => {
  const [admin, tenant] = await Promise.all([
    User.findOne({ tenantId, role: 'admin', isActive: true }).select('email name'),
    Tenant.findById(tenantId).select('settings'),
  ]);
  return {
    admin: admin ? { email: admin.email, name: admin.name } : null,
   
    alertDays: tenant?.settings?.alertDays?.length
      ? tenant.settings.alertDays
      : [30, 15, 7, 1],
  };
};

const createNotification = async (tenantId, type, title, message, entityId, entityType, severity) => {
  await Notification.create({ tenantId, type, title, message, entityId, entityType, severity });
};

// ── Domain Expiry Check ──────────────────────────────────────────────────────
const checkDomainExpiry = async () => {
  // Get all unique tenantIds that have domains
  const tenantIds = await Domain.distinct('tenantId');

  for (const tenantId of tenantIds) {
    const { admin, alertDays } = await getTenantContext(tenantId);
    const now = new Date();

    for (const days of alertDays) {
      const start = new Date(now);
      start.setDate(start.getDate() + days);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const alertField = `alertsSent.day${days}`;
      const domains = await Domain.find({
        tenantId,
        expiryDate: { $gte: start, $lte: end },
        [alertField]: false,
      }).populate('clientId', 'name email');

      for (const domain of domains) {
        try {
          if (admin) {
            await mailerService.sendDomainExpiryAlert(admin.email, admin.name, domain.name, days);
          }
          if (domain.clientId?.email) {
            await mailerService.sendDomainExpiryAlert(
              domain.clientId.email, domain.clientId.name, domain.name, days
            );
          }

          await createNotification(
            tenantId, 'domain_expiry',
            `Domain Expiring: ${domain.name}`,
            `${domain.name} expires in ${days} day${days !== 1 ? 's' : ''}`,
            domain._id, 'domain',
            days <= 7 ? 'danger' : 'warning'
          );

          domain.alertsSent[`day${days}`] = true;
          await domain.save({ validateBeforeSave: false });

          logger.info(`Domain expiry alert sent: ${domain.name} — ${days} days`);
        } catch (err) {
          logger.error(`Failed domain alert for ${domain.name}: ${err.message}`);
        }
      }
    }
  }
};

// ── Hosting Expiry Check ─────────────────────────────────────────────────────
const checkHostingExpiry = async () => {
  const tenantIds = await Hosting.distinct('tenantId');

  for (const tenantId of tenantIds) {
    const { admin, alertDays } = await getTenantContext(tenantId);
    const now = new Date();

    for (const days of alertDays) {
      const start = new Date(now);
      start.setDate(start.getDate() + days);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const alertField = `alertsSent.day${days}`;
      const hostingList = await Hosting.find({
        tenantId,
        expiryDate: { $gte: start, $lte: end },
        [alertField]: false,
      }).populate('clientId', 'name email');

      for (const hosting of hostingList) {
        try {
          if (admin) {
            await mailerService.sendHostingExpiryAlert(admin.email, admin.name, hosting.label, days);
          }

          await createNotification(
            tenantId, 'hosting_expiry',
            `Hosting Expiring: ${hosting.label}`,
            `${hosting.label} expires in ${days} day${days !== 1 ? 's' : ''}`,
            hosting._id, 'hosting',
            days <= 7 ? 'danger' : 'warning'
          );

          hosting.alertsSent[`day${days}`] = true;
          await hosting.save({ validateBeforeSave: false });

          logger.info(`Hosting expiry alert sent: ${hosting.label} — ${days} days`);
        } catch (err) {
          logger.error(`Failed hosting alert for ${hosting.label}: ${err.message}`);
        }
      }
    }
  }
};

// ── SSL Expiry Check ─────────────────────────────────────────────────────────
const checkSSLExpiry = async () => {
  const tenantIds = await Hosting.distinct('tenantId');

  for (const tenantId of tenantIds) {
    const { admin, alertDays } = await getTenantContext(tenantId);
    // SSL alerts only at 30/15/7 (not 1 day — not enough time to renew)
    const sslAlertDays = alertDays.filter(d => d >= 7);
    const now = new Date();

    for (const days of sslAlertDays) {
      const start = new Date(now);
      start.setDate(start.getDate() + days);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const alertField = `ssl.alertsSent.day${days}`;
      const hostingList = await Hosting.find({
        tenantId,
        'ssl.expiryDate': { $gte: start, $lte: end },
        'ssl.enabled': true,
        [alertField]: false,
      }).populate('clientId', 'name email');

      for (const hosting of hostingList) {
        try {
          if (admin) {
            await mailerService.sendSSLExpiryAlert(admin.email, admin.name, hosting.label, days);
          }

          await createNotification(
            tenantId, 'ssl_expiry',
            `SSL Expiring: ${hosting.label}`,
            `SSL certificate for ${hosting.label} expires in ${days} days`,
            hosting._id, 'hosting',
            days <= 7 ? 'danger' : 'warning'
          );

          hosting.ssl.alertsSent[`day${days}`] = true;
          await hosting.save({ validateBeforeSave: false });

          logger.info(`SSL expiry alert sent: ${hosting.label} — ${days} days`);
        } catch (err) {
          logger.error(`Failed SSL alert for ${hosting.label}: ${err.message}`);
        }
      }
    }
  }
};

// ── Overdue Invoice Check (runs at 9:00 AM UTC) ──────────────────────────────
cron.schedule('0 9 * * *', async () => {
  try {
    const { Invoice } = require('../models/index');
    const now = new Date();
    const overdueInvoices = await Invoice.find({
      status: { $in: ['sent', 'pending'] }, // catch both statuses
      dueDate: { $lt: now },
    });

    for (const invoice of overdueInvoices) {
      await Invoice.findByIdAndUpdate(invoice._id, { status: 'overdue' });
      await createNotification(
        invoice.tenantId, 'invoice_overdue',
        `Invoice Overdue: ${invoice.invoiceNo}`,
        `Invoice ${invoice.invoiceNo} of ₹${invoice.total} is overdue`,
        invoice._id, 'invoice', 'danger'
      );
    }

    if (overdueInvoices.length > 0) {
      logger.info(`Marked ${overdueInvoices.length} invoice(s) as overdue`);
    }
  } catch (err) {
    logger.error(`Overdue invoice check error: ${err.message}`);
  }
});

logger.info('Expiry checker cron jobs registered.');

// ── Auto Renewal: runs every day at 7:00 AM UTC ──────────────────────────────
cron.schedule('0 7 * * *', async () => {
  logger.info('Running auto-renewal cron job...');
  try {
    await autoRenewDomains();
    await autoRenewHosting();
    logger.info('Auto-renewal completed.');
  } catch (err) {
    logger.error(`Auto-renewal error: ${err.message}`);
  }
});

const autoRenewDomains = async () => {
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);

  // Find active auto-renewal domains expiring within 7 days
  const domains = await Domain.find({
    autoRenewal: true,
    status: { $in: ['active', 'expiring', 'expired'] },
    expiryDate: { $lte: sevenDays },
  });

  for (const domain of domains) {
    try {
      const oldExpiry = new Date(domain.expiryDate);
      // Renew by 1 year from current expiry (or from today if already expired)
      const base = oldExpiry > new Date() ? oldExpiry : new Date();
      base.setFullYear(base.getFullYear() + 1);
      domain.expiryDate = base;
      domain.alertsSent = { day30: false, day15: false, day7: false, day1: false };
      await domain.save();

      await Notification.create({
        tenantId: domain.tenantId,
        type: 'info',
        title: `Domain Auto-Renewed: ${domain.name}`,
        message: `${domain.name} was automatically renewed. New expiry: ${base.toDateString()}`,
        entityId: domain._id,
        entityType: 'domain',
        severity: 'info',
      });

      logger.info(`Domain auto-renewed: ${domain.name} → ${base.toDateString()}`);
    } catch (err) {
      logger.error(`Failed auto-renew domain ${domain.name}: ${err.message}`);
    }
  }
};

const autoRenewHosting = async () => {
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);

  const hostingList = await Hosting.find({
    autoRenewal: true,
    status: { $in: ['active', 'expiring', 'expired'] },
    expiryDate: { $lte: sevenDays },
  });

  for (const hosting of hostingList) {
    try {
      const oldExpiry = new Date(hosting.expiryDate);
      const base = oldExpiry > new Date() ? oldExpiry : new Date();
      base.setFullYear(base.getFullYear() + 1);
      hosting.expiryDate = base;
      hosting.alertsSent = { day30: false, day15: false, day7: false, day1: false };
      await hosting.save();

      await Notification.create({
        tenantId: hosting.tenantId,
        type: 'info',
        title: `Hosting Auto-Renewed: ${hosting.label}`,
        message: `${hosting.label} was automatically renewed. New expiry: ${base.toDateString()}`,
        entityId: hosting._id,
        entityType: 'hosting',
        severity: 'info',
      });

      logger.info(`Hosting auto-renewed: ${hosting.label} → ${base.toDateString()}`);
    } catch (err) {
      logger.error(`Failed auto-renew hosting ${hosting.label}: ${err.message}`);
    }
  }
};
