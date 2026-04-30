const audit = require('../utils/audit');
const Hosting = require('../models/Hosting.model');
const { UptimeLog, Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

const safeHosting = (hostingDoc) => {
  const obj = hostingDoc.toJSON();
  delete obj._cpanelInfoEncrypted;
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

    // Validate expiry date must be in the future
    if (!rest.expiryDate) return error(res, 'Expiry date is required', 400);
    const expiry = new Date(rest.expiryDate);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (expiry <= now) return error(res, 'Expiry date must be in the future', 400);

    const { tenantId: _t, ...safeRest } = rest;
    const hosting = new Hosting({ ...safeRest, tenantId: req.tenantId });
    if (cpanelInfo) hosting.cpanelInfo = cpanelInfo;
    await hosting.save();
    await hosting.populate('clientId', 'name email');
    audit.log(req, 'hosting.create', 'hosting', hosting._id, { label: hosting.label, planType: hosting.planType });
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
    const { cpanelInfo, tenantId: _t, ...rest } = req.body;

    // Validate expiry date must be in the future (if provided)
    if (rest.expiryDate) {
      const expiry = new Date(rest.expiryDate);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      if (expiry <= now) return error(res, 'Expiry date must be in the future', 400);
    }

    const hosting = await Hosting.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    Object.assign(hosting, rest);
    if (cpanelInfo) hosting.cpanelInfo = cpanelInfo;
    await hosting.save();

    audit.log(req, 'hosting.update', 'hosting', hosting._id, { label: hosting.label });
    return success(res, { hosting: safeHosting(hosting) }, 'Hosting updated');
  } catch (err) { next(err); }
};

// @DELETE /api/hosting/:id
exports.deleteHosting = async (req, res, next) => {
  try {
    const hosting = await Hosting.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);
    audit.log(req, 'hosting.delete', 'hosting', null, {});
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

const csv = require('csv-parser');
const { Parser } = require('json2csv');

// ── EXPORT HOSTING as CSV ────────────────────────────────────────────────────
exports.exportHostingCSV = async (req, res, next) => {
  try {
    const hostings = await Hosting.find({ tenantId: req.tenantId })
      .populate('clientId', 'name email')
      .sort({ expiryDate: 1 })
      .lean();

    const header = [
      'label', 'planType', 'provider', 'serverIP', 'serverLocation',
      'expiryDate', 'status', 'autoRenewal', 'isLocal', 'localOnly',
      'renewalCost', 'sellingPrice', 'diskSpace', 'bandwidth', 'ram',
      'notes', 'clientName', 'clientEmail',
    ].join(',');

    const rows = hostings.map(h => {
      const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        escape(h.label),
        escape(h.planType),
        escape(h.provider),
        escape(h.serverIP),
        escape(h.serverLocation),
        escape(h.expiryDate ? new Date(h.expiryDate).toISOString().split('T')[0] : ''),
        escape(h.status),
        escape(h.autoRenewal),
        escape(h.isLocal || false),
        escape(h.localOnly || false),
        escape(h.renewalCost || ''),
        escape(h.sellingPrice || ''),
        escape(h.diskSpace || ''),
        escape(h.bandwidth || ''),
        escape(h.ram || ''),
        escape(h.notes || ''),
        escape(h.clientId?.name || ''),
        escape(h.clientId?.email || ''),
      ].join(',');
    });

    const csvStr = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="hosting-export-${Date.now()}.csv"`);
    return res.send(csvStr);
  } catch (err) { next(err); }
};

// ── IMPORT HOSTING from CSV ──────────────────────────────────────────────────
const fs = require('fs');

exports.importHostingCSV = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No CSV file uploaded', 400);

    const allowedMimes = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];
    const isCSV = allowedMimes.includes(req.file.mimetype) || req.file.originalname.endsWith('.csv');
    if (!isCSV) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return error(res, 'Invalid file type. Only CSV files are allowed.', 400);
    }
    if (req.file.size > 2 * 1024 * 1024) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return error(res, 'File too large. Maximum allowed size is 2MB.', 400);
    }

    const results = [];
    let responded = false;
    const VALID_PLAN_TYPES = ['shared', 'vps', 'dedicated', 'cloud', 'reseller'];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('error', (streamErr) => {
        if (responded) return;
        responded = true;
        if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
        next(streamErr);
      })
      .on('end', async () => {
        if (responded) return;
        responded = true;

        if (results.length === 0) {
          if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
          return error(res, 'CSV file is empty or has no valid rows', 400);
        }
        if (results.length > 500) {
          if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
          return error(res, 'Too many rows. Maximum 500 records per import.', 400);
        }

        const created = [], errors = [], skipped = [];
        const now = new Date(); now.setHours(0, 0, 0, 0);

        for (let i = 0; i < results.length; i++) {
          const row = results[i];
          const rowNum = i + 2;
          const label = (row.label || row.name || '').trim();

          if (!label) {
            errors.push({ row: rowNum, label: '(empty)', error: 'Label is required' });
            continue;
          }
          const planType = (row.planType || row.plan_type || 'shared').toLowerCase().trim();
          if (!VALID_PLAN_TYPES.includes(planType)) {
            errors.push({ row: rowNum, label, error: `Invalid planType "${planType}". Must be: ${VALID_PLAN_TYPES.join(', ')}` });
            continue;
          }
          const expiryRaw = row.expiryDate || row.expiry || row.expiry_date;
          if (!expiryRaw) {
            errors.push({ row: rowNum, label, error: 'Expiry date is required' });
            continue;
          }
          const expiryDate = new Date(expiryRaw);
          if (isNaN(expiryDate.getTime())) {
            errors.push({ row: rowNum, label, error: `Invalid expiry date: "${expiryRaw}"` });
            continue;
          }

          try {
            const isLocal = ['true', '1', 'yes'].includes((row.isLocal || '').toLowerCase());
            const localOnly = ['true', '1', 'yes'].includes((row.localOnly || '').toLowerCase());
            await Hosting.create({
              label,
              planType,
              provider: (row.provider || '').trim() || undefined,
              serverIP: (row.serverIP || row.server_ip || '').trim() || undefined,
              serverLocation: (row.serverLocation || '').trim() || undefined,
              expiryDate,
              isLocal,
              localOnly,
              renewalCost: row.renewalCost ? parseFloat(row.renewalCost) : undefined,
              sellingPrice: row.sellingPrice ? parseFloat(row.sellingPrice) : undefined,
              diskSpace: (row.diskSpace || '').trim() || undefined,
              bandwidth: (row.bandwidth || '').trim() || undefined,
              ram: (row.ram || '').trim() || undefined,
              notes: (row.notes || '').trim() || undefined,
              tenantId: req.tenantId,
            });
            created.push(label);
          } catch (e) {
            errors.push({ row: rowNum, label, error: e.message });
          }
        }

        if (fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
        return success(res, {
          imported: created.length,
          skipped: skipped.length,
          failed: errors.length,
          errors,
        }, `Import complete: ${created.length} added, ${errors.length} failed`);
      });
  } catch (err) { next(err); }
};
