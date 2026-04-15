const crypto = require('crypto');
const User = require('../models/User.model');
const Tenant = require('../models/Tenant.model');
const generateToken = require('../utils/generateToken');
const { success, error } = require('../utils/apiResponse');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');

// @POST /api/auth/register  — Register new agency (Admin)
exports.register = async (req, res, next) => {
  try {
    const { orgName, name, email, password, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return error(res, 'Email already registered', 400);

    // Create tenant first
    // const tenant = await Tenant.create({ orgName, adminId: null });
    const placeholderId = new require('mongoose').Types.ObjectId();
    const tenant = await Tenant.create({ orgName, adminId: placeholderId });

    // Create admin user
    const user = await User.create({
      name, email, password, phone,
      role: 'admin',
      tenantId: tenant._id,
    });

    // Link admin to tenant
    tenant.adminId = user._id;
    await tenant.save();

    const token = generateToken(user);

    await mailerService.sendWelcomeEmail(email, name, orgName);

    return success(res, {
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
    }, 'Registration successful', 201);
  } catch (err) {
    next(err);
  }
};

// @POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return error(res, 'Invalid email or password', 401);
    }
    if (!user.isActive) return error(res, 'Account is deactivated', 403);

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user);
    return success(res, {
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// @GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('tenantId', 'orgName logo planName');
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

// @POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return error(res, 'No user with that email', 404);

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 min
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await mailerService.sendPasswordResetEmail(email, user.name, resetUrl);

    return success(res, {}, 'Password reset link sent to email');
  } catch (err) {
    next(err);
  }
};

// @POST /api/auth/reset-password/:token
exports.resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });
    if (!user) return error(res, 'Invalid or expired reset token', 400);

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return success(res, {}, 'Password reset successful');
  } catch (err) {
    next(err);
  }
};

// @PATCH /api/auth/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return error(res, 'Current password is incorrect', 400);
    }
    user.password = req.body.newPassword;
    await user.save();
    return success(res, {}, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};
