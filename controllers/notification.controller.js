const { Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

const buildQuery = (req, extra = {}) => {
  const isSuperAdmin = req.user?.role === 'superAdmin';
  return isSuperAdmin
    ? { ...extra }
    : { tenantId: req.tenantId, ...extra };
};

// @GET /api/notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, read } = req.query;
    const query = buildQuery(req);
    if (read !== undefined) query.read = read === 'true';

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('tenantId', 'name');

    const unreadCount = await Notification.countDocuments({
      ...buildQuery(req),
      read: false,
    });

    return success(res, { notifications, unreadCount });
  } catch (err) { next(err); }
};

// @PATCH /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    const filter = req.user?.role === 'superAdmin'
      ? { _id: req.params.id }
      : { _id: req.params.id, tenantId: req.tenantId };

    await Notification.findOneAndUpdate(filter, { read: true, readAt: new Date() });
    return success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
};

// @PATCH /api/notifications/read-all
exports.markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { ...buildQuery(req), read: false },
      { read: true, readAt: new Date() }
    );
    return success(res, {}, 'All notifications marked as read');
  } catch (err) { next(err); }
};

// @DELETE /api/notifications/:id
exports.deleteNotification = async (req, res, next) => {
  try {
    const filter = req.user?.role === 'superAdmin'
      ? { _id: req.params.id }
      : { _id: req.params.id, tenantId: req.tenantId };

    await Notification.findOneAndDelete(filter);
    return success(res, {}, 'Notification deleted');
  } catch (err) { next(err); }
};