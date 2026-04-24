const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const mailerService = require('../services/mailer.service');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');
const logger = require('../utils/logger');

exports.getPendingTenants = async (req, res, next) => {
    try {
        const tenants = await Tenant.find({ planStatus: 'pending' })
            .populate('adminId', 'name email phone')
            .populate('planId', 'displayName price')
            .sort({ createdAt: -1 });

        return success(res, {
            tenants,
            count: tenants.length,
        });
    } catch (err) { next(err); }
};


exports.approveTenant = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.params.id)
            .populate('adminId', 'name email')
            .populate('planId', 'displayName');

        if (!tenant) return error(res, 'Tenant not found', 404);

        if (tenant.planStatus === 'active') {
            return error(res, 'This tenant is already active', 400);
        }

        tenant.planStatus = 'active';
        tenant.approvedAt = new Date();
        tenant.approvedBy = req.user._id;
        tenant.rejectedAt = undefined;
        tenant.rejectionReason = undefined;
        await tenant.save();

        // Send "Plan Activated" email
        if (tenant.adminId?.email) {
            mailerService.sendPlanActivatedEmail?.(
                tenant.adminId.email,
                tenant.adminId.name,
                tenant.orgName,
                tenant.planId?.displayName || tenant.planName
            ).catch(err => logger.warn(`[mailer] plan-activated email failed: ${err.message}`));
        }

        audit.log(req, 'tenant.plan-approved', 'tenant', tenant._id, {
            orgName: tenant.orgName,
            plan: tenant.planName,
        });

        return success(res, { tenant }, `${tenant.orgName} activated`);
    } catch (err) { next(err); }
};

// ── @POST /api/super-admin/tenants/:id/reject ────────────────────────────
exports.rejectTenant = async (req, res, next) => {
    try {
        const { reason } = req.body;
        if (!reason?.trim()) return error(res, 'Rejection reason is required', 400);

        const tenant = await Tenant.findById(req.params.id)
            .populate('adminId', 'name email');
        if (!tenant) return error(res, 'Tenant not found', 404);

        if (tenant.planStatus === 'active') {
            return error(res, 'Cannot reject an already-active tenant', 400);
        }

        tenant.planStatus = 'rejected';
        tenant.rejectedAt = new Date();
        tenant.rejectionReason = reason.trim();
        await tenant.save();

        // Send "Plan Rejected" email
        if (tenant.adminId?.email) {
            mailerService.sendPlanRejectedEmail?.(
                tenant.adminId.email,
                tenant.adminId.name,
                tenant.orgName,
                reason.trim()
            ).catch(err => logger.warn(`[mailer] plan-rejected email failed: ${err.message}`));
        }

        audit.log(req, 'tenant.plan-rejected', 'tenant', tenant._id, {
            orgName: tenant.orgName,
            reason: reason.trim(),
        });

        return success(res, { tenant }, `${tenant.orgName} rejected`);
    } catch (err) { next(err); }
};

// ── @GET /api/tenant/status ───────
exports.getOwnTenantStatus = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.tenantId)
            .select('orgName planName planStatus rejectionReason createdAt approvedAt')
            .populate('planId', 'displayName price');

        if (!tenant) return error(res, 'Tenant not found', 404);

        return success(res, {
            planStatus: tenant.planStatus,
            planName: tenant.planName,
            planDisplay: tenant.planId?.displayName || tenant.planName,
            orgName: tenant.orgName,
            createdAt: tenant.createdAt,
            approvedAt: tenant.approvedAt,
            rejectionReason: tenant.rejectionReason,
        });
    } catch (err) { next(err); }
};