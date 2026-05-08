const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const { Plan } = require('../models/index');
const mailerService = require('../services/mailer.service');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');
const logger = require('../utils/logger');


exports.getPendingTenants = async (req, res, next) => {
    try {
        const tenants = await Tenant.find({
            planStatus: { $in: ['trial', 'trial_expired'] }
        })
            .populate('adminId', 'name email phone')
            .populate('planId', 'displayName price')
            .sort({ createdAt: -1 });

        const enriched = tenants.map(t => {
            const obj = t.toObject();
            if (t.isOnTrial && t.trialEndDate) {
                const diff = t.trialEndDate - new Date();
                obj.trialDaysRemaining = Math.max(0, Math.ceil(diff / 86400000));
            } else {
                obj.trialDaysRemaining = 0;
            }
            return obj;
        });

        return success(res, {
            tenants: enriched,
            count: enriched.length,
        });
    } catch (err) { next(err); }
};

// @POST /api/super-admin/tenants/:id/approve
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
        tenant.isOnTrial = false;
        tenant.approvedAt = new Date();
        tenant.approvedBy = req.user._id;
        tenant.rejectedAt = undefined;
        tenant.rejectionReason = undefined;
        await tenant.save();

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

// @POST /api/super-admin/tenants/:id/reject
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
        tenant.isOnTrial = false;
        tenant.rejectedAt = new Date();
        tenant.rejectionReason = reason.trim();
        await tenant.save();

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

// @GET /api/tenant/status
exports.getOwnTenantStatus = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.tenantId)
            .select('orgName planName planStatus rejectionReason createdAt approvedAt isOnTrial trialStartDate trialEndDate profileCompleted')
            .populate('planId', 'displayName price');

        if (!tenant) return error(res, 'Tenant not found', 404);

        // Check if trial expired on status fetch
        if (tenant.planStatus === 'trial' && tenant.isOnTrial && tenant.trialEndDate) {
            if (new Date() > tenant.trialEndDate) {
                tenant.planStatus = 'trial_expired';
                tenant.isOnTrial = false;
                await tenant.save();
            }
        }

        const trialDaysRemaining = tenant.isOnTrial && tenant.trialEndDate
            ? Math.max(0, Math.ceil((tenant.trialEndDate - new Date()) / 86400000))
            : null;

        return success(res, {
            planStatus: tenant.planStatus,
            planName: tenant.planName,
            planDisplay: tenant.planId?.displayName || tenant.planName,
            orgName: tenant.orgName,
            createdAt: tenant.createdAt,
            approvedAt: tenant.approvedAt,
            rejectionReason: tenant.rejectionReason,
            isOnTrial: tenant.isOnTrial,
            trialStartDate: tenant.trialStartDate,
            trialEndDate: tenant.trialEndDate,
            trialDaysRemaining,
            profileCompleted: tenant.profileCompleted || false,
        });
    } catch (err) { next(err); }
};

// @POST /api/tenant/subscribe — Subscribe to a plan after trial expiry
exports.subscribePlan = async (req, res, next) => {
    try {
        const { planId, couponCode, referralCode } = req.body;
        if (!planId) return error(res, 'Plan ID is required', 400);

        const plan = await Plan.findOne({ _id: planId, isActive: true });
        if (!plan) return error(res, 'Invalid or inactive plan', 400);

        const tenant = await Tenant.findById(req.tenantId);
        if (!tenant) return error(res, 'Tenant not found', 404);

        // Apply plan
        tenant.planId = plan._id;
        tenant.planName = plan.name;
        tenant.planStatus = 'active';
        tenant.isOnTrial = false;
        tenant.maxDomains = plan.maxDomains;
        tenant.maxClients = plan.maxClients;
        tenant.maxHosting = plan.maxHosting;
        tenant.maxStaff = plan.maxStaff;
        tenant.subscriptionStart = new Date();
        tenant.subscriptionEnd = new Date(Date.now() + (plan.billingCycle === 'yearly' ? 365 : 30) * 86400000);
        tenant.approvedAt = new Date();

        await tenant.save();

        audit.log(req, 'tenant.subscribed', 'tenant', tenant._id, {
            plan: plan.name,
            couponCode: couponCode || null,
        });

        return success(res, { tenant }, `Subscribed to ${plan.displayName} successfully`);
    } catch (err) { next(err); }
};