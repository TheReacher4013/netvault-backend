const ActivityLog = require('../models/ActivityLog.model');
const logger = require('./logger');

/**
 * Fire-and-forget audit write. Failures are logged but never propagate.
 * @param {object} req - Express request (must have req.user if authenticated)
 * @param {string} action - dot-namespaced action, e.g. 'invoice.create'
 * @param {string|null} entityType - 'domain' | 'hosting' | 'client' | 'invoice' | 'user' | 'tenant' | 'auth' | 'credential'
 * @param {mongoose.ObjectId|string|null} entityId - primary key of the acted-on entity
 * @param {object} [metadata] - arbitrary structured metadata (no secrets)
 */
exports.log = (req, action, entityType, entityId, metadata = {}) => {
  try {
    ActivityLog.create({
      tenantId:  req.tenantId || req.user?.tenantId || null,
      userId:    req.user?._id || null,
      userName:  req.user?.name || null,
      userEmail: req.user?.email || null,
      action,
      entityType,
      entityId,
      metadata,
      ip:        req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers?.['user-agent']?.slice(0, 255) || null,
    }).catch(err => {
      
      logger.warn(`[audit] Failed to write log for ${action}: ${err.message}`);
    });
  } catch (err) {
    logger.warn(`[audit] Unexpected error: ${err.message}`);
  }
};
