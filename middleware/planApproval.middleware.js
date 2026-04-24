const Tenant = require('../models/Tenant.model');
const logger = require('../utils/logger');

const WHITELIST = [
    /^\/api\/auth\/me\b/,
    /^\/api\/auth\/logout\b/,
    /^\/api\/auth\/change-password\b/,
    /^\/api\/auth\/2fa\//,
    /^\/api\/users\/profile\b/,
    /^\/api\/tenant\/status\b/,
    /^\/api\/notifications\b/,
];

const isWhitelisted = (url) => WHITELIST.some(re => re.test(url));

const checkPlanApproved = async (req, res, next) => {
    try {
        // 1. Super admin bypasses entirely
        if (req.user?.role === 'superAdmin') return next();

        // 2. Clients are sandboxed via auth.middleware already
        if (req.user?.role === 'client') return next();

        // 3. Whitelisted routes pass through
        if (isWhitelisted(req.originalUrl)) return next();

        // 4. Safety: if tenantId missing (shouldn't happen for admin/staff), allow
        if (!req.tenantId) {
            logger.warn(`[planApproval] No tenantId on req for ${req.originalUrl} — allowing through`);
            return next();
        }

        // 5. Look up tenant
        const tenant = await Tenant.findById(req.tenantId).select('planStatus planName orgName');

        // 6. If tenant missing somehow, fail-open (don't trap user — let other
        //    middleware raise a proper error)
        if (!tenant) {
            logger.warn(`[planApproval] Tenant ${req.tenantId} not found — allowing through`);
            return next();
        }

        // 7. Backward compat: missing planStatus = legacy tenant = active
        const status = tenant.planStatus || 'active';
        if (status === 'active') return next();

        // 8. Blocked — respond with 403 (NOT 404) and structured payload
        return res.status(403).json({
            success: false,
            message:
                status === 'pending' ? 'Your plan is awaiting Super Admin approval. You will be notified by email once approved.' :
                    status === 'rejected' ? 'Your plan request was rejected. Please contact support.' :
                        'Your account is currently suspended. Please contact support.',
            data: {
                blocked: true,
                planStatus: status,
                planName: tenant.planName,
                orgName: tenant.orgName,
            },
        });
    } catch (err) {
        logger.error(`[planApproval] Error: ${err.message}`);
        // Fail-open on unexpected errors — don't lock users out
        return next();
    }
};

module.exports = checkPlanApproved;