const ActivityLog = require('../models/ActivityLog.model');
const { success, error } = require('../utils/apiResponse');


exports.getLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, action, entityType, entityId, userId } = req.query;
        const query = {};

        if (req.user.role !== 'superAdmin') {
            query.tenantId = req.tenantId;
        } else if (req.query.tenantId) {
            query.tenantId = req.query.tenantId;
        }

        if (action) query.action = action;
        if (entityType) query.entityType = entityType;
        if (entityId) query.entityId = entityId;
        if (userId) query.userId = userId;

        const result = await ActivityLog.paginate(query, {
            page: parseInt(page),
            limit: Math.min(parseInt(limit), 200),
            sort: { createdAt: -1 },
        });

        return success(res, result);
    } catch (err) { next(err); }
};

// @GET /api/activity/entity/:type/:id  — timeline for a single entity
exports.getEntityTimeline = async (req, res, next) => {
    try {
        const { type, id } = req.params;
        const query = { entityType: type, entityId: id };
        if (req.user.role !== 'superAdmin') query.tenantId = req.tenantId;

        const logs = await ActivityLog.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        return success(res, { logs });
    } catch (err) { next(err); }
};
