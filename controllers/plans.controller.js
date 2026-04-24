const { Plan } = require('../models/index');
const { success } = require('../utils/apiResponse');

// @GET /api/plans
exports.getPublicPlans = async (req, res, next) => {
    try {
        const plans = await Plan
            .find({ isActive: true })
            .select('name displayName price billingCycle maxDomains maxClients maxHosting maxStaff features isPopular trialDays')
            .sort({ price: 1 });
        return success(res, { plans });
    } catch (err) { next(err); }
};