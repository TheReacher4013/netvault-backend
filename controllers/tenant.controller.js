const Tenant = require('../models/Tenant.model');
const { success, error } = require('../utils/apiResponse');

exports.getMyTenant = async (req, res, next) => {
    try {
        const tenant = await Tenant.findById(req.tenantId)
            .populate('adminId', 'name email')
            .populate('planId', 'displayName price maxDomains maxClients maxStaff maxHosting features');
        if (!tenant) return error(res, 'Tenant not found', 404);
        return success(res, { tenant });
    } catch (err) { next(err); }
};


exports.updateMyTenant = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') {
            return error(res, 'Only the account admin can update company settings', 403);
        }

        const {
            orgName, website, address, phone, email, logo,
            countryCode, country,
            settings,
        } = req.body;

        const profileCompleted = !!(orgName && phone && (website || address));

        const tenant = await Tenant.findByIdAndUpdate(
            req.tenantId,
            {
                orgName, website, address, phone, email, logo,
                countryCode, country,
                settings,
                ...(profileCompleted ? { profileCompleted: true } : {}),
            },
            { new: true, runValidators: true }
        );

        if (!tenant) return error(res, 'Tenant not found', 404);
        return success(res, { tenant }, 'Company settings updated');
    } catch (err) { next(err); }
};

exports.uploadLogo = async (req, res, next) => {
    try {
        if (!req.file) return require('../utils/apiResponse').error(res, 'No file uploaded', 400);
        const url = `/uploads/logos/${req.file.filename}`;
        const tenant = await require('../models/Tenant.model').findByIdAndUpdate(
            req.tenantId,
            { logo: url },
            { new: true }
        );
        return require('../utils/apiResponse').success(res, { logo: url, tenant }, 'Logo updated');
    } catch (err) { next(err); }
};
