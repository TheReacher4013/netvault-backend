const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { error } = require('../utils/apiResponse');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return error(res, 'Not authorized, no token', 401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user || !req.user.isActive) {
      return error(res, 'User not found or deactivated', 401);
    }

    // ✅ FIX (Bug #13): Use tenantId from the live DB user record, not the JWT.
    // The JWT payload could be stale (e.g., after a tenant reassignment),
    // while req.user.tenantId is always the current DB value.
    req.tenantId = req.user.tenantId;

    next();
  } catch (err) {
    return error(res, 'Not authorized, invalid token', 401);
  }
};

module.exports = protect;
