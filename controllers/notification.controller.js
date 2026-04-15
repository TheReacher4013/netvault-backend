const { Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');

// @GET /api/notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, read } = req.query;
    const query = { tenantId: req.tenantId };
    if (read !== undefined) query.read = read === 'true';

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const unreadCount = await Notification.countDocuments({ tenantId: req.tenantId, read: false });
    return success(res, { notifications, unreadCount });
  } catch (err) { next(err); }
};

// @PATCH /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { read: true, readAt: new Date() }
    );
    return success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
};

// @PATCH /api/notifications/read-all
exports.markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { tenantId: req.tenantId, read: false },
      { read: true, readAt: new Date() }
    );
    return success(res, {}, 'All notifications marked as read');
  } catch (err) { next(err); }
};

// @DELETE /api/notifications/:id
exports.deleteNotification = async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    return success(res, {}, 'Notification deleted');
  } catch (err) { next(err); }
};
