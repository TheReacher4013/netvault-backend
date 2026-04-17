const Hosting = require('../models/Hosting.model');
const { UptimeLog, Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

// Helper: strip the encrypted blob before sending to client
const safeHosting = (hostingDoc) => {
  const obj = hostingDoc.toJSON();
  delete obj._cpanelInfoEncrypted; // ✅ FIX (Bug #4): always strip this field
  return obj;
};

// @GET /api/hosting
exports.getHosting = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, clientId, search } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status;
    if (clientId) query.clientId = clientId;
    if (search) query.label = { $regex: search, $options: 'i' };

    const options = {
      page: parseInt(page), limit: parseInt(limit),
      sort: { expiryDate: 1 },
      populate: { path: 'clientId', select: 'name email' },
    };
    const result = await Hosting.paginate(query, options);

    // Strip encrypted field from every doc in the paginated result
    if (result.docs) {
      result.docs = result.docs.map(safeHosting);
    }

    return success(res, result);
  } catch (err) { next(err); }
};

// @POST /api/hosting
exports.addHosting = async (req, res, next) => {
  try {
    const { cpanelInfo, ...rest } = req.body;

    // ✅ Whitelist protected fields
    const { tenantId: _t, ...safeRest } = rest; // prevent body tenantId injection
    const hosting = new Hosting({ ...safeRest, tenantId: req.tenantId });
    if (cpanelInfo) hosting.cpanelInfo = cpanelInfo; // goes through virtual setter → encrypted
    await hosting.save();
    await hosting.populate('clientId', 'name email');
    return success(res, { hosting: safeHosting(hosting) }, 'Hosting added', 201);
  } catch (err) { next(err); }
};

// @GET /api/hosting/:id
exports.getHostingById = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone');
    if (!hosting) return error(res, 'Hosting not found', 404);
    return success(res, { hosting: safeHosting(hosting) });
  } catch (err) { next(err); }
};

// @PUT /api/hosting/:id
exports.updateHosting = async (req, res, next) => {
  try {
    const { cpanelInfo, tenantId: _t, ...rest } = req.body; // strip tenantId injection
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    Object.assign(hosting, rest);
    if (cpanelInfo) hosting.cpanelInfo = cpanelInfo;
    await hosting.save();

    // ✅ FIX (Bug #4): Use safeHosting() — previously toJSON() without delete
    // was leaking _cpanelInfoEncrypted in the update response
    return success(res, { hosting: safeHosting(hosting) }, 'Hosting updated');
  } catch (err) { next(err); }
};

// @DELETE /api/hosting/:id
exports.deleteHosting = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    return success(res, {}, 'Hosting deleted');
  } catch (err) { next(err); }
};

// @GET /api/hosting/:id/credentials  — Decrypt and return cPanel info (admin only)
exports.getCredentials = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    // .toObject() triggers the virtual getter which decrypts
    const creds = hosting.toObject().cpanelInfo;
    if (!creds) return error(res, 'No credentials stored', 404);
    return success(res, { credentials: creds });
  } catch (err) { next(err); }
};

// @GET /api/hosting/:id/ssl-status
exports.getSSLStatus = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    const ssl = hosting.ssl;
    let daysLeft = null;
    if (ssl.expiryDate) {
      daysLeft = Math.ceil((ssl.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    }
    return success(res, { ssl, daysLeft });
  } catch (err) { next(err); }
};

// @GET /api/hosting/:id/uptime
exports.getUptimeLogs = async (req, res, next) => {
  try {
    const logs = await UptimeLog.find({ hostingId: req.params.id, tenantId: req.tenantId })
      .sort({ checkedAt: -1 }).limit(100);
    const upCount = logs.filter(l => l.status === 'up').length;
    const uptimePercent = logs.length ? ((upCount / logs.length) * 100).toFixed(2) : 100;
    return success(res, { logs, uptimePercent: parseFloat(uptimePercent) });
  } catch (err) { next(err); }
};

// @GET /api/hosting/stats
exports.getHostingStats = async (req, res, next) => {
  try {
    const [total, active, expiring, expired] = await Promise.all([
      Hosting.countDocuments({ tenantId: req.tenantId }),
      Hosting.countDocuments({ tenantId: req.tenantId, status: 'active' }),
      Hosting.countDocuments({ tenantId: req.tenantId, status: 'expiring' }),
      Hosting.countDocuments({ tenantId: req.tenantId, status: 'expired' }),
    ]);
    return success(res, { total, active, expiring, expired });
  } catch (err) { next(err); }
};
