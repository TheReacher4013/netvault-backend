const Hosting = require('../models/Hosting.model');
const { UptimeLog, Notification } = require('../models/index');
const { encryptData, decryptData } = require('../services/encrypt.service');
const { success, error } = require('../utils/apiResponse');
const axios = require('axios');

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
    return success(res, result);
  } catch (err) { next(err); }
};

// @POST /api/hosting
exports.addHosting = async (req, res, next) => {
  try {
    const { cpanelInfo, ...rest } = req.body;
    const hosting = new Hosting({ ...rest, tenantId: req.tenantId });
    if (cpanelInfo) hosting.cpanelInfo = cpanelInfo;
    await hosting.save();
    await hosting.populate('clientId', 'name email');
    return success(res, { hosting }, 'Hosting added', 201);
  } catch (err) { next(err); }
};

// @GET /api/hosting/:id
exports.getHostingById = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone');
    if (!hosting) return error(res, 'Hosting not found', 404);
    // Don't expose encrypted creds in normal GET
    const hostingObj = hosting.toJSON();
    delete hostingObj._cpanelInfoEncrypted;
    return success(res, { hosting: hostingObj });
  } catch (err) { next(err); }
};

// @PUT /api/hosting/:id
exports.updateHosting = async (req, res, next) => {
  try {
    const { cpanelInfo, ...rest } = req.body;
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    Object.assign(hosting, rest);
    if (cpanelInfo) hosting.cpanelInfo = cpanelInfo;
    await hosting.save();
    return success(res, { hosting: hosting.toJSON() }, 'Hosting updated');
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

// @GET /api/hosting/:id/credentials  — Decrypt and return cPanel info
exports.getCredentials = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
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
    const now = new Date();
    let daysLeft = null;
    if (ssl.expiryDate) {
      daysLeft = Math.ceil((ssl.expiryDate - now) / (1000 * 60 * 60 * 24));
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
