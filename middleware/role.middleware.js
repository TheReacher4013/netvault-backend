const { error } = require('../utils/apiResponse');

const ROLE_PERMISSIONS = {
  superAdmin: ['all'],
  admin: ['domains', 'hosting', 'clients', 'billing', 'vault', 'users', 'settings', 'reports'],
  staff: ['domains', 'hosting', 'clients', 'billing:create', 'vault:read'],
  client: ['portal'],
};

// Simple role check — can this role do this action?
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return error(res, 'Not authenticated', 401);
    // superAdmin always passes
    if (req.user.role === 'superAdmin') return next();
    if (!allowedRoles.includes(req.user.role)) {
      return error(res, `Role '${req.user.role}' is not authorized for this action`, 403);
    }
    next();
  };
};

module.exports = checkRole;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;