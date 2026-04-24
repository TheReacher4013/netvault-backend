const Hosting = require('../models/Hosting.model');
const { UptimeLog } = require('../models/index');
const { success, error } = require('../utils/apiResponse');


exports.getLiveStatus = async (req, res, next) => {
  try {
    const hostingList = await Hosting.find({
      tenantId: req.tenantId,
      'uptime.monitorEnabled': true,
    }).select('label serverIP planType uptime clientId').populate('clientId', 'name');

    return success(res, { servers: hostingList });
  } catch (err) { next(err); }
};

// @GET /api/uptime/logs/:hostingId
exports.getUptimeLogs = async (req, res, next) => {
  try {
    const { limit = 100, page = 1 } = req.query;
    const hosting = await Hosting.findOne({ _id: req.params.hostingId, tenantId: req.tenantId });
    if (!hosting) return error(res, 'Hosting not found', 404);

    const logs = await UptimeLog.find({ hostingId: req.params.hostingId })
      .sort({ checkedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await UptimeLog.countDocuments({ hostingId: req.params.hostingId });
    const upCount = await UptimeLog.countDocuments({ hostingId: req.params.hostingId, status: 'up' });
    const uptimePercent = total > 0 ? ((upCount / total) * 100).toFixed(2) : 100;

    return success(res, { logs, total, uptimePercent: parseFloat(uptimePercent) });
  } catch (err) { next(err); }
};

// @GET /api/uptime/summary
exports.getUptimeSummary = async (req, res, next) => {
  try {
    const hosting = await Hosting.find({ tenantId: req.tenantId, 'uptime.monitorEnabled': true });
    const summary = hosting.map(h => ({
      _id: h._id,
      label: h.label,
      serverIP: h.serverIP,
      status: h.uptime.currentStatus,
      lastChecked: h.uptime.lastChecked,
      uptimePercent: h.uptime.uptimePercent,
    }));
    const downCount = summary.filter(s => s.status === 'down').length;
    return success(res, { summary, downCount, totalMonitored: summary.length });
  } catch (err) { next(err); }
};
