const mongoose = require('mongoose');
const Tenant = require('../models/Tenant.model');
const User = require('../models/User.model');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { Client, Invoice, Plan } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');
const mailerService = require('../services/mailer.service');

exports.getPlatformStats = async (req, res, next) => {
  try {
    const [
      totalTenants,
      activeTenants,
      totalUsers,
      totalDomains,
      activeDomains,
      expiringDomains,
      totalHosting,
      totalClients,
      revenueResult,
    ] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $ne: 'superAdmin' } }),
      Domain.countDocuments(),
      Domain.countDocuments({ status: 'active' }),
      Domain.countDocuments({ status: 'expiring' }),
      Hosting.countDocuments(),
      Client.countDocuments({ isActive: true }),
      Invoice.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    // Monthly revenue across ALL tenants (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyRevenue = await Invoice.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } },
          revenue: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Top 5 tenants by domain count
    const topTenantsByDomains = await Domain.aggregate([
      { $group: { _id: '$tenantId', domainCount: { $sum: 1 } } },
      { $sort: { domainCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'tenants',
          localField: '_id',
          foreignField: '_id',
          as: 'tenant',
        },
      },
      { $unwind: '$tenant' },
      {
        $project: {
          domainCount: 1,
          orgName: '$tenant.orgName',
          planName: '$tenant.planName',
        },
      },
    ]);

    return success(res, {
      tenants: { total: totalTenants, active: activeTenants, suspended: totalTenants - activeTenants },
      users: { total: totalUsers },
      domains: { total: totalDomains, active: activeDomains, expiring: expiringDomains },
      hosting: { total: totalHosting },
      clients: { total: totalClients },
      revenue: {
        allTime: revenueResult[0]?.total || 0,
        monthly: monthlyRevenue,
      },
      topTenantsByDomains,
    });
  } catch (err) { next(err); }
};

// ── @GET /api/super-admin/tenants ──────────
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

    // Attach live counts to each tenant
    const tenantsWithCounts = await Promise.all(
      tenants.map(async (t) => {
        const [domainCount, clientCount, userCount] = await Promise.all([
          Domain.countDocuments({ tenantId: t._id }),
          Client.countDocuments({ tenantId: t._id }),
          User.countDocuments({ tenantId: t._id }),
        ]);
        return { ...t.toObject(), domainCount, clientCount, userCount };
      })
    );

    return success(res, { tenants: tenantsWithCounts, total });
  } catch (err) { next(err); }
};

// ── @GET /api/super-admin/tenants/:id ───────
exports.getTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id)
      .populate('adminId', 'name email phone')
      .populate('planId');
    if (!tenant) return error(res, 'Tenant not found', 404);

    const tenantId = tenant._id;

    const [users, domains, hosting, clients, invoiceStats] = await Promise.all([
      User.find({ tenantId }).select('name email role isActive lastLogin createdAt'),
      Domain.find({ tenantId })
        .populate('clientId', 'name email')
        .sort({ expiryDate: 1 })
        .limit(50),
      Hosting.find({ tenantId })
        .populate('clientId', 'name email')
        .sort({ expiryDate: 1 })
        .limit(50),
      Client.find({ tenantId }).sort({ createdAt: -1 }).limit(50),
      Invoice.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$total' },
          },
        },
      ]),
    ]);

    const invoiceSummary = invoiceStats.reduce((acc, i) => {
      acc[i._id] = { count: i.count, total: i.total };
      return acc;
    }, {});

    return success(res, {
      tenant,
      counts: {
        users: users.length,
        domains: domains.length,
        hosting: hosting.length,
        clients: clients.length,
      },
      users,
      domains,
      hosting,
      clients,
      invoiceSummary,
    });
  } catch (err) { next(err); }
};

// ── @POST /api/super-admin/tenants ────────────
exports.createTenant = async (req, res, next) => {
  try {
    const {
      orgName,
      adminName,
      adminEmail,
      adminPassword,
      adminPhone,
      planName = 'free',
      website,
      address,
      phone,
      email,
    } = req.body;

    if (!orgName || !adminName || !adminEmail || !adminPassword) {
      return error(res, 'orgName, adminName, adminEmail and adminPassword are required', 400);
    }

    // Check for duplicate admin email
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) return error(res, 'A user with this email already exists', 400);

    // Look up the plan
    const plan = await Plan.findOne({ name: planName });


    const adminUser = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      phone: adminPhone,
      role: 'admin',
      tenantId: new mongoose.Types.ObjectId(),
    });

    // Step 2: Create tenant with real adminId
    const tenant = await Tenant.create({
      orgName,
      adminId: adminUser._id,
      planId: plan?._id,
      planName: plan?.name || planName,
      maxDomains: plan?.maxDomains || 20,
      maxClients: plan?.maxClients || 10,
      maxStaff: plan?.maxStaff || 3,
      maxHosting: plan?.maxHosting || 10,
      website,
      address,
      phone,
      email,
    });

    // Step 3: Update admin user's tenantId to the real tenant
    adminUser.tenantId = tenant._id;
    await adminUser.save({ validateBeforeSave: false });

    await tenant.populate('adminId', 'name email');

    return success(res, { tenant, admin: { name: adminUser.name, email: adminUser.email } },
      'Company and admin account created successfully', 201);
  } catch (err) { next(err); }
};

exports.updateTenantPlan = async (req, res, next) => {
  try {
    const { planId, extendTrialDays } = req.body;
    if (!planId) return error(res, 'planId is required', 400);

    const plan = await Plan.findOne({ _id: planId, isActive: true });
    if (!plan) return error(res, 'Plan not found or inactive', 400);

    const tenant = await Tenant.findById(req.params.id).populate('adminId', 'name email');
    if (!tenant) return error(res, 'Tenant not found', 404);

    const previousPlanName = tenant.planName;

    // Copy plan properties onto tenant
    tenant.planId = plan._id;
    tenant.planName = plan.name;
    tenant.maxDomains = plan.maxDomains;
    tenant.maxClients = plan.maxClients;
    tenant.maxStaff = plan.maxStaff;
    tenant.maxHosting = plan.maxHosting;

    // Optionally extend subscription end date
    if (extendTrialDays && Number.isFinite(+extendTrialDays) && +extendTrialDays > 0) {
      const current = tenant.subscriptionEnd && tenant.subscriptionEnd > new Date()
        ? tenant.subscriptionEnd
        : new Date();
      tenant.subscriptionEnd = new Date(current.getTime() + (+extendTrialDays) * 86400000);
    } else if (!tenant.subscriptionEnd) {
      // No end date set yet — give them the new plan's default trial
      tenant.subscriptionEnd = new Date(Date.now() + (plan.trialDays || 14) * 86400000);
    }

    await tenant.save();

    // Audit
    audit.log(req, 'tenant.plan-change', 'tenant', tenant._id, {
      from: previousPlanName, to: plan.name, orgName: tenant.orgName,
    });

    // Best-effort email notification to tenant admin
    if (tenant.adminId?.email) {
      mailerService.sendPlanChangeEmail?.(
        tenant.adminId.email, tenant.adminId.name, tenant.orgName,
        previousPlanName || '—', plan.displayName
      ).catch(err => console.warn(`[mailer] plan-change email failed: ${err.message}`));
    }

    return success(res, { tenant }, `Plan updated to ${plan.displayName}`);
  } catch (err) { next(err); }
};

// ── @PATCH /api/super-admin/tenants/:id/toggle ────────────────────────────
exports.toggleTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return error(res, 'Tenant not found', 404);
    tenant.isActive = !tenant.isActive;
    await tenant.save();

    // Also deactivate/reactivate all users in this tenant
    await User.updateMany(
      { tenantId: tenant._id, role: { $ne: 'superAdmin' } },
      { isActive: tenant.isActive }
    );

    return success(res, { isActive: tenant.isActive },
      `Company ${tenant.isActive ? 'activated' : 'suspended'} — all users updated`);
  } catch (err) { next(err); }
};

// ── @DELETE /api/super-admin/tenants/:id ─────────────────────────────────
// Hard delete a tenant and ALL their data
exports.deleteTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return error(res, 'Tenant not found', 404);

    const tenantId = tenant._id;

    // Delete all tenant data in parallel
    await Promise.all([
      User.deleteMany({ tenantId }),
      Domain.deleteMany({ tenantId }),
      Hosting.deleteMany({ tenantId }),
      Client.deleteMany({ tenantId }),
      Invoice.deleteMany({ tenantId }),
      Tenant.findByIdAndDelete(tenantId),
    ]);

    return success(res, {}, 'Company and all associated data permanently deleted');
  } catch (err) { next(err); }
};

// ── @GET /api/super-admin/domains ─────────────────────────────────────────
// All domains across ALL tenants — cross-tenant view
exports.getAllDomains = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, status, tenantId, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (tenantId) query.tenantId = tenantId;
    if (search) query.name = { $regex: search, $options: 'i' };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { expiryDate: 1 },
      populate: [
        { path: 'clientId', select: 'name email' },
        { path: 'tenantId', select: 'orgName' },
      ],
    };

    const result = await Domain.paginate(query, options);
    return success(res, result);
  } catch (err) { next(err); }
};

// ── @GET /api/super-admin/clients ─────────────────────────────────────────
// All clients across ALL tenants
exports.getAllClients = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, tenantId, search } = req.query;
    const query = {};
    if (tenantId) query.tenantId = tenantId;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const clients = await Client.find(query)
      .populate('tenantId', 'orgName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Client.countDocuments(query);
    return success(res, { clients, total });
  } catch (err) { next(err); }
};

// ── @GET /api/super-admin/plans ───────────────────────────────────────────
exports.getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });
    return success(res, { plans });
  } catch (err) { next(err); }
};

// ── @POST /api/super-admin/plans ──────────────────────────────────────────
exports.createPlan = async (req, res, next) => {
  try {
    const plan = await Plan.create(req.body);
    return success(res, { plan }, 'Plan created', 201);
  } catch (err) { next(err); }
};

// ── @PUT /api/super-admin/plans/:id ──────────────────────────────────────
exports.updatePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return error(res, 'Plan not found', 404);
    return success(res, { plan }, 'Plan updated');
  } catch (err) { next(err); }
};

// ── @DELETE /api/super-admin/plans/:id ───────────────────────────────────
exports.deletePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return error(res, 'Plan not found', 404);

    // Prevent deleting a plan that is assigned to active tenants
    const tenantsOnPlan = await Tenant.countDocuments({ planId: req.params.id });
    if (tenantsOnPlan > 0) {
      return error(res, `Cannot delete plan — ${tenantsOnPlan} company(s) are currently on this plan. Reassign them first.`, 400);
    }

    await Plan.findByIdAndDelete(req.params.id);
    return success(res, {}, 'Plan deleted successfully.');
  } catch (err) { next(err); }
};