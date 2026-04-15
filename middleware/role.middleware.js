const { error } = require('../utils/apiResponse');

const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return error(res, 'Not authenticated', 401);
    if (!roles.includes(req.user.role)) {
      return error(res, `Role '${req.user.role}' is not authorized for this action`, 403);
    }
    next();
  };
};

module.exports = checkRole;
