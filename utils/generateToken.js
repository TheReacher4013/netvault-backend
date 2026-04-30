const jwt = require('jsonwebtoken');

const generateToken = (user, rememberMe = false) => {
  return jwt.sign(
    { id: user._id, role: user.role, tenantId: user.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? '30d' : (process.env.JWT_EXPIRES_IN || '7d') }
  );
};

module.exports = generateToken;
