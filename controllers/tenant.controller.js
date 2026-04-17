// controllers/tenant.controller.js
// Allows the logged-in admin to view and update THEIR OWN company settings.
// This is separate from the SuperAdmin controller which manages ALL tenants.

const Tenant = require('../models/Tenant.model');
const { success, error } = require('../utils/apiResponse');

// @GET /api/tenant/me  — Get current tenant info
exports.getMyTenant = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.tenantId)
            .populate('adminId', 'name email')
            .populate('planId', 'displayName price maxDomains maxClients maxStaff maxHosting features');
        if (!tenant) return error(res, 'Tenant not found', 404);
        return success(res, { tenant });
    } catch (err) { next(err); }
};

// @PUT /api/tenant/me  — Update own company settings (admin only)
exports.updateMyTenant = async (req, res, next) => {
    try {
        // Only admin of that tenant can update it
        if (req.user.role !== 'admin') {
            return error(res, 'Only the account admin can update company settings', 403);
        }

        // Whitelist: only allow safe fields to be updated
        const {
            orgName, website, address, phone, email, logo,
            settings,
        } = req.body;

        const tenant = await Tenant.findByIdAndUpdate(
            req.tenantId,
            { orgName, website, address, phone, email, logo, settings },
            { new: true, runValidators: true }
        );

        if (!tenant) return error(res, 'Tenant not found', 404);
        return success(res, { tenant }, 'Company settings updated');
    } catch (err) { next(err); }
};
