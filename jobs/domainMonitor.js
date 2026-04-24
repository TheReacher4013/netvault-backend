const cron = require('node-cron');
const axios = require('axios');
const Domain = require('../models/Domain.model');
const { Notification } = require('../models/index');
const User = require('../models/User.model');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');
const { getIO } = require('../utils/socket');

const CHECK_INTERVAL = '*/15 * * * *';  
const ALERT_THROTTLE_MS = 2 * 60 * 60 * 1000;  
const REQUEST_TIMEOUT = 8000;             
const CONCURRENCY = 10;


const runWithConcurrency = async (tasks, limit = 10) => {
    const results = [];
    const executing = new Set();
    for (const task of tasks) {
        const p = Promise.resolve().then(() => task()).finally(() => executing.delete(p));
        results.push(p);
        executing.add(p);
        if (executing.size >= limit) await Promise.race(executing);
    }
    return Promise.allSettled(results);
};


const probeDomain = async (domainName) => {
    const schemes = ['https', 'http'];
    let lastError = null;

    for (const scheme of schemes) {
        try {
            const start = Date.now();
            const res = await axios.get(`${scheme}://${domainName}`, {
                timeout: REQUEST_TIMEOUT,
                maxRedirects: 5,
                validateStatus: () => true,  
                httpsAgent: scheme === 'https'
                    ? new (require('https')).Agent({ rejectUnauthorized: false })
                    : undefined,
            });
            return {
                status: 'up',
                scheme,
                statusCode: res.status,
                responseTime: Date.now() - start,
                error: null,
            };
        } catch (err) {
            lastError = err.message;
           
        }
    }

    return {
        status: 'down',
        scheme: null,
        statusCode: null,
        responseTime: null,
        error: lastError,
    };
};

const checkDomain = async (domain) => {
    const result = await probeDomain(domain.name);
    const now = new Date();

    const prevState = domain.monitoring?.currentState || 'unknown';
    const isNowDown = result.status === 'down';

    // Build updated monitoring subdoc
    const monitoring = {
        lastChecked: now,
        currentState: result.status,
        lastDownAt: isNowDown ? now : domain.monitoring?.lastDownAt,
        lastUpAt: !isNowDown ? now : domain.monitoring?.lastUpAt,
        lastAlertAt: domain.monitoring?.lastAlertAt,
    };

   
    let shouldAlert = false;
    if (isNowDown) {
        const last = domain.monitoring?.lastAlertAt;
        const dueForAlert = !last || (now.getTime() - new Date(last).getTime()) >= ALERT_THROTTLE_MS;
        if (dueForAlert) {
            shouldAlert = true;
            monitoring.lastAlertAt = now;
        }
    }

    await Domain.findByIdAndUpdate(domain._id, { monitoring });

    if (shouldAlert) {
        logger.warn(`Domain DOWN: ${domain.name} (error: ${result.error || 'unreachable'})`);

        try {
            const admin = await User.findOne({
                tenantId: domain.tenantId, role: 'admin', isActive: true,
            });
            if (admin?.email && mailerService.sendDomainDownAlert) {
                await mailerService.sendDomainDownAlert(
                    admin.email, admin.name, domain.name, result.error || 'Unreachable'
                );
            }

            await Notification.create({
                tenantId: domain.tenantId,
                type: 'server_down',
                title: `Domain Down: ${domain.name}`,
                message: `${domain.name} is unreachable. ${result.error ? 'Error: ' + result.error : ''}`,
                entityId: domain._id,
                entityType: 'domain',
                severity: 'danger',
            });

            const io = getIO();
            io?.to(`tenant-${domain.tenantId}`).emit('domain-down', {
                domainId: domain._id,
                name: domain.name,
                error: result.error,
                timestamp: now,
            });
        } catch (err) {
            logger.error(`Failed to send DOWN alert for ${domain.name}: ${err.message}`);
        }
    }

    // ── Recovery (transition down → up) — always notify, no throttle ──
    if (!isNowDown && prevState === 'down') {
        logger.info(`Domain RECOVERED: ${domain.name}`);

        try {
            await Notification.create({
                tenantId: domain.tenantId,
                type: 'info',
                title: `Domain Recovered: ${domain.name}`,
                message: `${domain.name} is back online (${result.scheme.toUpperCase()})`,
                entityId: domain._id,
                entityType: 'domain',
                severity: 'success',
            });

            const io = getIO();
            io?.to(`tenant-${domain.tenantId}`).emit('domain-up', {
                domainId: domain._id,
                name: domain.name,
                timestamp: now,
            });
        } catch (err) {
            logger.error(`Failed to send RECOVERY notification for ${domain.name}: ${err.message}`);
        }
    }
};

// Cron handler
cron.schedule(CHECK_INTERVAL, async () => {
    try {
       
        const domains = await Domain.find({
            isLive: { $ne: false },
            status: { $in: ['active', 'expiring'] },
        }).select('_id name tenantId monitoring');

        if (domains.length === 0) return;

        logger.info(`[domain-monitor] Checking ${domains.length} domain(s)`);

        await runWithConcurrency(
            domains.map(d => () => checkDomain(d)),
            CONCURRENCY
        );
    } catch (err) {
        logger.error(`Domain monitor error: ${err.message}`);
    }
});

logger.info(`Domain monitor cron registered (every 15 min, 2hr alert throttle).`);