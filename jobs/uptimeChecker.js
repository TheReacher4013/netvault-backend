const cron = require('node-cron');
const axios = require('axios');
const Hosting = require('../models/Hosting.model');
const { UptimeLog, Notification } = require('../models/index');
const User = require('../models/User.model');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');
// ✅ FIX (Bug #2): Use the socket singleton instead of require('../server').
// server.js requires this file at startup, so require('../server') created a
// circular dependency — Node returned a partial exports object where `io`
// was always undefined. Socket DOWN events silently never fired.
const { getIO } = require('../utils/socket');

// Simple concurrency limiter (avoids installing p-limit just for this)
const runWithConcurrency = async (tasks, limit = 10) => {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).finally(() => executing.delete(p));
    results.push(p);
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.allSettled(results);
};

// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const hostingList = await Hosting.find({ 'uptime.monitorEnabled': true })
      .select('_id label serverIP tenantId uptime clientId');

    if (hostingList.length === 0) return;

    // ✅ FIX (Bug #14): Run pings in parallel with a concurrency cap of 10.
    // Original used for...of with await — 100 hosts × 10s timeout = 1000s per run,
    // causing cron jobs to pile up. Now all pings run concurrently (max 10 at once).
    await runWithConcurrency(
      hostingList.map(hosting => () => pingServer(hosting)),
      10
    );
  } catch (err) {
    logger.error(`Uptime checker error: ${err.message}`);
  }
});

const pingServer = async (hosting) => {
  if (!hosting.serverIP) return;

  const url = `http://${hosting.serverIP}`;
  const startTime = Date.now();
  let status = 'down';
  let responseTime = null;
  let statusCode = null;
  let errorMsg = null;

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true, // don't throw on non-2xx
    });
    statusCode = response.status;
    responseTime = Date.now() - startTime;
    // Treat anything below 500 as "up" (site might return 301, 401, etc.)
    status = response.status < 500 ? 'up' : 'down';
  } catch (err) {
    errorMsg = err.message;
    status = 'down';
  }

  // Save uptime log entry
  await UptimeLog.create({
    hostingId: hosting._id,
    tenantId: hosting.tenantId,
    status, responseTime, statusCode,
    error: errorMsg,
    checkedAt: new Date(),
  });

  const wasDown = hosting.uptime.currentStatus === 'down';
  const isNowDown = status === 'down';

  // Recalculate uptime% from last 100 pings
  const recentLogs = await UptimeLog.find({ hostingId: hosting._id })
    .sort({ checkedAt: -1 }).limit(100);
  const upCount = recentLogs.filter(l => l.status === 'up').length;
  const uptimePercent = recentLogs.length > 0 ? (upCount / recentLogs.length) * 100 : 100;

  await Hosting.findByIdAndUpdate(hosting._id, {
    'uptime.currentStatus': status,
    'uptime.lastChecked': new Date(),
    'uptime.uptimePercent': parseFloat(uptimePercent.toFixed(2)),
  });

  // Alert when server just went DOWN (transition: up → down)
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

      // ✅ FIX (Bug #2): getIO() returns the io instance registered by server.js
      // via setIO(). No circular dependency — io is always available here.
      const io = getIO();
      io?.to(`tenant-${hosting.tenantId}`).emit('server-down', {
        hostingId: hosting._id,
        label: hosting.label,
        serverIP: hosting.serverIP,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error(`Failed to send DOWN alert for ${hosting.label}: ${err.message}`);
    }
  }

  // Notify when server RECOVERED (transition: down → up)
  if (!isNowDown && wasDown) {
    logger.info(`Server RECOVERED: ${hosting.label}`);

    try {
      await Notification.create({
        tenantId: hosting.tenantId,
        type: 'info',
        title: `Server Recovered: ${hosting.label}`,
        message: `${hosting.label} is back online`,
        entityId: hosting._id,
        entityType: 'hosting',
        severity: 'success',
      });

      const io = getIO();
      io?.to(`tenant-${hosting.tenantId}`).emit('server-up', {
        hostingId: hosting._id,
        label: hosting.label,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error(`Failed to send RECOVERY notification for ${hosting.label}: ${err.message}`);
    }
  }
};

logger.info('Uptime checker cron job registered (every 5 min).');
