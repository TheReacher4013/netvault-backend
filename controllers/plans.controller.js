const { Plan } = require('../models/index');
const { success } = require('../utils/apiResponse');

// @GET /api/plans?country=IN
exports.getPublicPlans = async (req, res, next) => {
    try {
        const { country } = req.query;

        // Build query — plans with no country restriction OR matching the given country
        const query = { isActive: true };
        if (country) {
            query.$or = [
                { availableCountries: { $size: 0 } },
                { availableCountries: { $exists: false } },
                { availableCountries: country.toUpperCase() },
            ];
        }

        const plans = await Plan
            .find(query)
            .select('name displayName price currency billingCycle maxDomains maxClients maxHosting maxStaff features isPopular trialDays availableCountries')
            .sort({ price: 1 });

        return success(res, { plans });
    } catch (err) { next(err); }
};
