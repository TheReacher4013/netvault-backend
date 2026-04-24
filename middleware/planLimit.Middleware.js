const Tenant = require('../models/Tenant.model');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client } = require('../models/index');
const { error } = require('../utils/apiResponse');

// ── Shared helper ─────
const checkLimit = async (req, res, next, Model, tenantField, limitField, resourceName) => {
    try {
        // SuperAdmin is never limited
        if (req.user?.role === 'superAdmin') return next();

        const tenant = await Tenant.findById(req.tenantId).select(limitField);
        if (!tenant) return error(res, 'Tenant not found', 404);

        const limit = tenant[limitField];
        // Unlimited if limit is 0 or very large (99999)
        if (!limit || limit >= 99999) return next();

        const current = await Model.countDocuments({ tenantId: req.tenantId });
        if (current >= limit) {
            return error(
                res,
                `Plan limit reached: your ${req.user?.tenantId ? 'current' : ''} plan allows a maximum of ${limit} ${resourceName}. ` +
                `You have ${current}. Please upgrade your plan to add more.`,
                403
            );
        }

        next();
    } catch (err) {
        next(err);
    }
};

// ── Per-resource limit checkers ───────────────────────────────────────────
exports.checkDomainLimit = (req, res, next) =>
    checkLimit(req, res, next, Domain, 'tenantId', 'maxDomains', 'domains');

exports.checkClientLimit = (req, res, next) =>
    checkLimit(req, res, next, Client, 'tenantId', 'maxClients', 'clients');

exports.checkHostingLimit = (req, res, next) =>
    checkLimit(req, res, next, Hosting, 'tenantId', 'maxHosting', 'hosting accounts');

// ── Staff count limiter (used in user creation) ───────────────────────────
exports.checkStaffLimit = async (req, res, next) => {
    try {
        if (req.user?.role === 'superAdmin') return next();

        const User = require('../models/User.model');
        const tenant = await Tenant.findById(req.tenantId).select('maxStaff');
        if (!tenant) return error(res, 'Tenant not found', 404);

        const limit = tenant.maxStaff;
        if (!limit || limit >= 99999) return next();

        // Count only staff/admin (not client portal users)
        const current = await User.countDocuments({
            tenantId: req.tenantId,
            role: { $in: ['admin', 'staff'] },
        });

        if (current >= limit) {
            return error(
                res,
                `Plan limit reached: your plan allows a maximum of ${limit} staff/admin accounts. ` +
                `Upgrade your plan to add more team members.`,
                403
            );
        }
        next();
    } catch (err) {
        next(err);
    }
};
