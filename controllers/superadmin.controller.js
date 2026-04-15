const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const { Plan, Invoice } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

// @GET /api/super-admin/tenants
exports.getTenants = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = {};
    if (search) query.orgName = { $regex: search, $options: 'i' };

    const tenants = await Tenant.find(query)
      .populate('adminId', 'name email')
      .populate('planId', 'displayName price')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Tenant.countDocuments(query);
    return success(res, { tenants, total });
  } catch (err) { next(err); }
};

// @GET /api/super-admin/tenants/:id
exports.getTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .populate('adminId', 'name email phone')
      .populate('planId');
    if (!tenant) return error(res, 'Tenant not found', 404);
    const userCount = await User.countDocuments({ tenantId: tenant._id });
    return success(res, { tenant, userCount });
  } catch (err) { next(err); }
};

// @PATCH /api/super-admin/tenants/:id/plan
exports.updateTenantPlan = async (req, res, next) => {
  try {
    const { planId, planName, maxDomains, maxClients, maxStaff, subscriptionEnd } = req.body;
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { planId, planName, maxDomains, maxClients, maxStaff, subscriptionEnd },
      { new: true }
    );
    if (!tenant) return error(res, 'Tenant not found', 404);
    return success(res, { tenant }, 'Tenant plan updated');
  } catch (err) { next(err); }
};

// @PATCH /api/super-admin/tenants/:id/toggle
exports.toggleTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return error(res, 'Tenant not found', 404);
    tenant.isActive = !tenant.isActive;
    await tenant.save();
    return success(res, { isActive: tenant.isActive }, `Tenant ${tenant.isActive ? 'activated' : 'suspended'}`);
  } catch (err) { next(err); }
};

// @GET /api/super-admin/plans
exports.getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });
    return success(res, { plans });
  } catch (err) { next(err); }
};

// @POST /api/super-admin/plans
exports.createPlan = async (req, res, next) => {
  try {
    const plan = await Plan.create(req.body);
    return success(res, { plan }, 'Plan created', 201);
  } catch (err) { next(err); }
};

// @PUT /api/super-admin/plans/:id
exports.updatePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return error(res, 'Plan not found', 404);
    return success(res, { plan }, 'Plan updated');
  } catch (err) { next(err); }
};

// @GET /api/super-admin/stats
exports.getPlatformStats = async (req, res, next) => {
  try {
    const [totalTenants, activeTenants, totalUsers] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $ne: 'superAdmin' } }),
    ]);
    return success(res, { totalTenants, activeTenants, totalUsers });
  } catch (err) { next(err); }
};
