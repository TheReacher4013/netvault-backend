const cron = require('node-cron');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const User = require('../models/User.model');
const { Notification } = require('../models/index');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');

// Runs every day at 8:00 AM
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

const getAdminEmail = async (tenantId) => {
  const admin = await User.findOne({ tenantId, role: 'admin', isActive: true });
  return admin ? { email: admin.email, name: admin.name } : null;
};

const createNotification = async (tenantId, type, title, message, entityId, entityType, severity) => {
  await Notification.create({ tenantId, type, title, message, entityId, entityType, severity });
};

// ── Domain Expiry Check ──────────────────────────────────────────────────
const checkDomainExpiry = async () => {
  const alertDays = [30, 15, 7, 1];
  const now = new Date();

  for (const days of alertDays) {
    const start = new Date(now);
    start.setDate(start.getDate() + days);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const alertField = `alertsSent.day${days}`;
    const domains = await Domain.find({
      expiryDate: { $gte: start, $lte: end },
      [alertField]: false,
    }).populate('clientId', 'name email');

    for (const domain of domains) {
      try {
        const admin = await getAdminEmail(domain.tenantId);
        if (admin) {
          await mailerService.sendDomainExpiryAlert(admin.email, admin.name, domain.name, days);
        }
        // Also alert client
        if (domain.clientId?.email) {
          await mailerService.sendDomainExpiryAlert(
            domain.clientId.email, domain.clientId.name, domain.name, days
          );
        }

        await createNotification(
          domain.tenantId,
          'domain_expiry',
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
};

// ── Hosting Expiry Check ─────────────────────────────────────────────────
const checkHostingExpiry = async () => {
  const alertDays = [30, 15, 7, 1];
  const now = new Date();

  for (const days of alertDays) {
    const start = new Date(now);
    start.setDate(start.getDate() + days);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const alertField = `alertsSent.day${days}`;
    const hostingList = await Hosting.find({
      expiryDate: { $gte: start, $lte: end },
      [alertField]: false,
    }).populate('clientId', 'name email');

    for (const hosting of hostingList) {
      try {
        const admin = await getAdminEmail(hosting.tenantId);
        if (admin) {
          await mailerService.sendHostingExpiryAlert(admin.email, admin.name, hosting.label, days);
        }

        await createNotification(
          hosting.tenantId,
          'hosting_expiry',
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
};

// ── SSL Expiry Check ─────────────────────────────────────────────────────
const checkSSLExpiry = async () => {
  const alertDays = [30, 15, 7];
  const now = new Date();

  for (const days of alertDays) {
    const start = new Date(now);
    start.setDate(start.getDate() + days);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const alertField = `ssl.alertsSent.day${days}`;
    const hostingList = await Hosting.find({
      'ssl.expiryDate': { $gte: start, $lte: end },
      'ssl.enabled': true,
      [alertField]: false,
    }).populate('clientId', 'name email');

    for (const hosting of hostingList) {
      try {
        const admin = await getAdminEmail(hosting.tenantId);
        if (admin) {
          await mailerService.sendSSLExpiryAlert(admin.email, admin.name, hosting.label, days);
        }

        await createNotification(
          hosting.tenantId,
          'ssl_expiry',
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
};

// Also check for overdue invoices daily
cron.schedule('0 9 * * *', async () => {
  try {
    const { Invoice } = require('../models/index');
    const now = new Date();
    const overdueInvoices = await Invoice.find({
      status: 'pending',
      dueDate: { $lt: now },
    });
    for (const invoice of overdueInvoices) {
      await Invoice.findByIdAndUpdate(invoice._id, { status: 'overdue' });
      await createNotification(
        invoice.tenantId,
        'invoice_overdue',
        `Invoice Overdue: ${invoice.invoiceNo}`,
        `Invoice ${invoice.invoiceNo} of ₹${invoice.total} is overdue`,
        invoice._id, 'invoice', 'danger'
      );
    }
    if (overdueInvoices.length > 0) {
      logger.info(`Marked ${overdueInvoices.length} invoices as overdue`);
    }
  } catch (err) {
    logger.error(`Overdue invoice check error: ${err.message}`);
  }
});

logger.info('Expiry checker cron job registered.');
