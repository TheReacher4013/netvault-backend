const cron = require('node-cron');
const axios = require('axios');
const Hosting = require('../models/Hosting.model');
const { UptimeLog, Notification } = require('../models/index');
const User = require('../models/User.model');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');

// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const hostingList = await Hosting.find({ 'uptime.monitorEnabled': true })
      .select('_id label serverIP tenantId uptime clientId');

    for (const hosting of hostingList) {
      await pingServer(hosting);
    }
  } catch (err) {
    logger.error(`Uptime checker error: ${err.message}`);
  }
});

const pingServer = async (hosting) => {
  const url = hosting.serverIP
    ? `http://${hosting.serverIP}`
    : null;

  if (!url) return;

  const startTime = Date.now();
  let status = 'down';
  let responseTime = null;
  let statusCode = null;
  let errorMsg = null;

  try {
    const response = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    statusCode = response.status;
    responseTime = Date.now() - startTime;
    status = response.status < 500 ? 'up' : 'down';
  } catch (err) {
    errorMsg = err.message;
    status = 'down';
  }

  // Save log
  await UptimeLog.create({
    hostingId: hosting._id,
    tenantId: hosting.tenantId,
    status, responseTime, statusCode,
    error: errorMsg,
    checkedAt: new Date(),
  });

  const wasDown = hosting.uptime.currentStatus === 'down';
  const isNowDown = status === 'down';

  // Update hosting uptime status
  const recentLogs = await UptimeLog.find({ hostingId: hosting._id })
    .sort({ checkedAt: -1 }).limit(100);
  const upCount = recentLogs.filter(l => l.status === 'up').length;
  const uptimePercent = recentLogs.length > 0 ? (upCount / recentLogs.length) * 100 : 100;

  await Hosting.findByIdAndUpdate(hosting._id, {
    'uptime.currentStatus': status,
    'uptime.lastChecked': new Date(),
    'uptime.uptimePercent': parseFloat(uptimePercent.toFixed(2)),
  });

  // Alert if just went down
  if (isNowDown && !wasDown) {
    logger.warn(`Server DOWN: ${hosting.label} (${hosting.serverIP})`);

    try {
      const admin = await User.findOne({ tenantId: hosting.tenantId, role: 'admin', isActive: true });
      if (admin) {
        await mailerService.sendServerDownAlert(admin.email, admin.name, hosting.label);
      }

      await Notification.create({
        tenantId: hosting.tenantId,
        type: 'server_down',
        title: `Server Down: ${hosting.label}`,
        message: `${hosting.label} (${hosting.serverIP}) is unreachable`,
        entityId: hosting._id,
        entityType: 'hosting',
        severity: 'danger',
      });

      // Emit real-time socket event
      const { io } = require('../server');
      io?.to(`tenant-${hosting.tenantId}`).emit('server-down', {
        hostingId: hosting._id,
        label: hosting.label,
        serverIP: hosting.serverIP,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error(`Failed to send down alert for ${hosting.label}: ${err.message}`);
    }
  }

  // Alert when back up
  if (!isNowDown && wasDown) {
    logger.info(`Server RECOVERED: ${hosting.label}`);
    await Notification.create({
      tenantId: hosting.tenantId,
      type: 'info',
      title: `Server Recovered: ${hosting.label}`,
      message: `${hosting.label} is back online`,
      entityId: hosting._id,
      entityType: 'hosting',
      severity: 'success',
    });
  }
};

logger.info('Uptime checker cron job registered (every 5 min).');
