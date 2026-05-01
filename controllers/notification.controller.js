const Notification = require('../models/Notification.model');
const { success, error } = require('../utils/apiResponse');


const buildAlertQuery = (req, extra = {}) => {
  const base = { source: 'system', ...extra };
  if (req.user?.role === 'superAdmin') return base;
  return { ...base, tenantId: req.tenantId };
};

// @GET /api/alerts
exports.getAlerts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, read } = req.query;
    const query = buildAlertQuery(req);
    if (read === 'true') query.read = true;
    if (read === 'false') query.read = false;

    const total = await Notification.countDocuments(query);
    const alerts = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const unreadCount = await Notification.countDocuments(
      buildAlertQuery(req, { read: false })
    );

    const totalPages = Math.ceil(total / parseInt(limit));
    return success(res, { notifications: alerts, total, totalPages, unreadCount });
  } catch (err) { next(err); }
};

// @PATCH /api/alerts/:id/read
exports.markAlertRead = async (req, res, next) => {
  try {
    const filter = req.user?.role === 'superAdmin'
      ? { _id: req.params.id, source: 'system' }
      : { _id: req.params.id, source: 'system', tenantId: req.tenantId };
    await Notification.findOneAndUpdate(filter, { read: true, readAt: new Date() });
    return success(res, {}, 'Alert marked as read');
  } catch (err) { next(err); }
};

// @PATCH /api/alerts/read-all
exports.markAllAlertsRead = async (req, res, next) => {
  try {
    const filter = buildAlertQuery(req, { read: false });
    await Notification.updateMany(filter, { read: true, readAt: new Date() });
    return success(res, {}, 'All alerts marked as read');
  } catch (err) { next(err); }
};

// @DELETE /api/alerts/:id
exports.deleteAlert = async (req, res, next) => {
  try {
    const filter = req.user?.role === 'superAdmin'
      ? { _id: req.params.id, source: 'system' }
      : { _id: req.params.id, source: 'system', tenantId: req.tenantId };
    await Notification.findOneAndDelete(filter);
    return success(res, {}, 'Alert deleted');
  } catch (err) { next(err); }
};


// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST NOTIFICATIONS  (source: 'broadcast')
// Admin/SuperAdmin creates these; read state tracked per-user via readBy[].
// ─────────────────────────────────────────────────────────────────────────────

const buildNotifQuery = (req, extra = {}) => {
  const base = { source: 'broadcast', ...extra };
  if (req.user?.role === 'superAdmin') return base;
  return {
    ...base,
    $or: [
      { isGlobal: true },
      { targetRoles: req.user.role },
    ],
  };
};

// @POST /api/notifications — superAdmin only
exports.createNotification = async (req, res, next) => {
  try {
    if (req.user?.role !== 'superAdmin') return error(res, 'Forbidden', 403);
    const { title, message, type, targetRoles, targetUsers, isGlobal, actionUrl } = req.body;
    const notification = await Notification.create({
      source: 'broadcast',
      title, message, type, targetRoles, targetUsers, isGlobal,
      actionUrl: actionUrl || null,
      createdBy: req.user._id,
    });
    return success(res, { notification }, 'Notification created', 201);
  } catch (err) { next(err); }
};

// @PUT /api/notifications/:id — superAdmin only
exports.updateNotification = async (req, res, next) => {
  try {
    if (req.user?.role !== 'superAdmin') return error(res, 'Forbidden', 403);
    const { title, message, type, targetRoles, targetUsers, isGlobal, actionUrl } = req.body;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, source: 'broadcast' },
      { title, message, type, targetRoles, targetUsers, isGlobal, actionUrl: actionUrl || null },
      { new: true, runValidators: true }
    );
    if (!notification) return error(res, 'Not found', 404);
    return success(res, { notification }, 'Notification updated');
  } catch (err) { next(err); }
};

// @GET /api/notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const query = buildNotifQuery(req);

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('createdBy', 'name email');

    const unreadCount = await Notification.countDocuments({
      ...buildNotifQuery(req),
      readBy: { $ne: req.user._id },
    });

    const userId = req.user._id.toString();
    const notificationsWithRead = notifications.map(n => ({
      ...n.toObject(),
      isRead: n.readBy.map(id => id.toString()).includes(userId),
    }));

    return success(res, { notifications: notificationsWithRead, total, unreadCount });
  } catch (err) { next(err); }
};

// @PATCH /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, source: 'broadcast' },
      { $addToSet: { readBy: req.user._id } }
    );
    return success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
};

// @PATCH /api/notifications/read-all
exports.markAllRead = async (req, res, next) => {
  try {
    const query = buildNotifQuery(req);
    await Notification.updateMany(query, { $addToSet: { readBy: req.user._id } });
    return success(res, {}, 'All notifications marked as read');
  } catch (err) { next(err); }
};

// @DELETE /api/notifications/:id — superAdmin only
exports.deleteNotification = async (req, res, next) => {
  try {
    if (req.user?.role !== 'superAdmin') return error(res, 'Forbidden', 403);
    await Notification.findOneAndDelete({ _id: req.params.id, source: 'broadcast' });
    return success(res, {}, 'Notification deleted');
  } catch (err) { next(err); }
};
