const Tenant = require('../models/Tenant.model');
const logger = require('../utils/logger');

const WHITELIST = [
    /^\/api\/auth\/me\b/,
    /^\/api\/auth\/logout\b/,
    /^\/api\/auth\/change-password\b/,
    /^\/api\/auth\/2fa\//,
    /^\/api\/users\/profile\b/,
    /^\/api\/tenant\/status\b/,
    /^\/api\/tenant\/me\b/,
    /^\/api\/tenant\/subscribe\b/,
    /^\/api\/notifications\b/,
    /^\/api\/plans\b/,
    /^\/api\/coupons\/validate\b/,
];

const isWhitelisted = (url) => WHITELIST.some(re => re.test(url));

const checkPlanApproved = async (req, res, next) => {
    try {
        if (req.user?.role === 'superAdmin') return next();
        if (req.user?.role === 'client') return next();
        if (isWhitelisted(req.originalUrl)) return next();
        if (!req.tenantId) {
            logger.warn(`[planApproval] No tenantId on req for ${req.originalUrl} — allowing through`);
            return next();
        }

        const tenant = await Tenant.findById(req.tenantId)
            .select('planStatus planName orgName isOnTrial trialEndDate trialStartDate');

        if (!tenant) {
            logger.warn(`[planApproval] Tenant ${req.tenantId} not found — allowing through`);
            return next();
        }

        const status = tenant.planStatus || 'active';

        // Active — full access
        if (status === 'active') return next();

        // Pending — no approval flow anymore, treat as trial fallback
        if (status === 'pending') return next();

        // Trial — check if still within trial period
        if (status === 'trial') {
            if (tenant.isOnTrial && tenant.trialEndDate) {
                if (new Date() <= tenant.trialEndDate) {
                    return next(); // Still in valid trial
                }
                // Trial expired — update status in DB but still allow through
                // Frontend SubscriptionModal handles the payment wall
                tenant.planStatus = 'trial_expired';
                tenant.isOnTrial = false;
                await tenant.save();
            }
            // Even if trial expired, allow API through — frontend modal gates the UI
            return next();
        }

        // Trial expired (already set in DB from a previous request)
        // Allow through — frontend SubscriptionModal is the payment wall
        if (status === 'trial_expired') return next();

        // Only truly block: rejected or suspended
        const messages = {
            rejected: 'Your plan request was rejected. Please contact support.',
            suspended: 'Your account is currently suspended. Please contact support.',
        };

        return res.status(403).json({
            success: false,
            message: messages[status] || 'Account access restricted. Please contact support.',
            data: {
                blocked: true,
                planStatus: tenant.planStatus,
                planName: tenant.planName,
                orgName: tenant.orgName,
                trialEndDate: tenant.trialEndDate,
                trialStartDate: tenant.trialStartDate,
            },
        });
    } catch (err) {
        logger.error(`[planApproval] Error: ${err.message}`);
        return next();
    }
};

module.exports = checkPlanApproved;