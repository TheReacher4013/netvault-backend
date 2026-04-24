const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const User = require('../models/User.model');
const Tenant = require('../models/Tenant.model');
const { Plan } = require('../models/index');
const generateToken = require('../utils/generateToken');
const { success, error } = require('../utils/apiResponse');
const mailerService = require('../services/mailer.service');
const logger = require('../utils/logger');
const audit = require('../utils/audit');
const otpController = require('./otp.controller');

// ── helpers ─────────────────────────────────────────────────────────────────
const issueTempToken = (userId) =>
  jwt.sign({ id: userId, purpose: '2fa-pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });

const verifyTempToken = (tempToken) => {
  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (decoded.purpose !== '2fa-pending') return null;
    return decoded.id;
  } catch { return null; }
};

const generateBackupCodes = async () => {
  const plain = [], hashed = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex');
    plain.push(code);
    hashed.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashed };
};

// ── REGISTER ────────────────
exports.register = async (req, res, next) => {
  const supportsTx = mongoose.connection.readyState === 1
    && mongoose.connection.host
    && (process.env.MONGO_TRANSACTIONS !== 'false');

  try {
    const { orgName, name, email, password, phone, planId } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    // Basic validation
    if (!orgName?.trim()) return error(res, 'Organisation name is required', 400);
    if (!name?.trim()) return error(res, 'Your name is required', 400);
    if (!normalizedEmail) return error(res, 'Email is required', 400);
    if (!password || password.length < 6) return error(res, 'Password must be at least 6 characters', 400);

    // Require verified OTP
    const verified = await otpController.isEmailVerified(normalizedEmail);
    if (!verified) {
      return error(res, 'Please verify your email first. Request a code and enter it before continuing.', 400);
    }

    // Email uniqueness
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return error(res, 'Email already registered', 400);

    // Plan validation
    let selectedPlan = null;
    if (planId) {
      selectedPlan = await Plan.findOne({ _id: planId, isActive: true });
      if (!selectedPlan) return error(res, 'Selected plan is invalid or inactive', 400);
    }

    const trialDays = selectedPlan?.trialDays ?? 14;
    const subscriptionEnd = new Date(Date.now() + trialDays * 86400000);

    const planStatus =
      !selectedPlan ? 'active' :
        selectedPlan.price === 0 ? 'active' :
          'pending';

    const tenantBase = {
      orgName,
      planStatus,                          
      ...(selectedPlan ? {
        planId: selectedPlan._id,
        planName: selectedPlan.name,
        maxDomains: selectedPlan.maxDomains,   
        maxClients: selectedPlan.maxClients,
        maxHosting: selectedPlan.maxHosting,
        maxStaff: selectedPlan.maxStaff,
        subscriptionStart: new Date(),
        subscriptionEnd,
      } : {}),
    };

    let user, tenant;

    if (supportsTx) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const userDocs = await User.create([{
            name, email: normalizedEmail, password, phone,
            role: 'admin',
            tenantId: new mongoose.Types.ObjectId(),
          }], { session });
          user = userDocs[0];

          const tenantDocs = await Tenant.create([{
            ...tenantBase, adminId: user._id,
          }], { session });
          tenant = tenantDocs[0];

          user.tenantId = tenant._id;
          await user.save({ session, validateBeforeSave: false });
        });
      } finally {
        session.endSession();
      }
    } else {
      user = await User.create({
        name, email: normalizedEmail, password, phone,
        role: 'admin',
        tenantId: new mongoose.Types.ObjectId(),
      });
      try {
        tenant = await Tenant.create({ ...tenantBase, adminId: user._id });
        user.tenantId = tenant._id;
        await user.save({ validateBeforeSave: false });
      } catch (tenantErr) {
        await User.findByIdAndDelete(user._id).catch(() => { });
        throw tenantErr;
      }
    }

    // Consume verified OTP token
    await otpController.consumeVerifiedToken(normalizedEmail);

    const token = generateToken(user);

    mailerService.sendWelcomeEmail(normalizedEmail, name, orgName).catch(err =>
      logger.error(`Welcome email failed for ${normalizedEmail}: ${err.message}`)
    );

    req.user = user;
    req.tenantId = tenant._id;
    audit.log(req, 'auth.register', 'tenant', tenant._id, {
      orgName, email: normalizedEmail,
      plan: selectedPlan?.name || null,
      planStatus,
    });

    return success(res, {
      token,
      user: {
        _id: user._id, name: user.name, email: user.email,
        role: user.role, tenantId: user.tenantId,
      },
      plan: selectedPlan ? {
        name: selectedPlan.name,
        displayName: selectedPlan.displayName,
        trialDays,
      } : null,
      planStatus,   
    },
      planStatus === 'pending'
        ? 'Registration successful. Your plan is pending Super Admin approval.'
        : 'Registration successful',
      201);
  } catch (err) {
    next(err);
  }
};

// ── LOGIN ────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password +twoFactorSecret');

    if (!user || !(await user.matchPassword(password))) {
      if (user) { req.user = user; req.tenantId = user.tenantId; }
      audit.log(req, 'auth.login-failed', 'auth', null, { email });
      return error(res, 'Invalid email or password', 401);
    }
    if (!user.isActive) {
      req.user = user; req.tenantId = user.tenantId;
      audit.log(req, 'auth.login-blocked', 'user', user._id, { email, reason: 'deactivated' });
      return error(res, 'Account is deactivated', 403);
    }

    if (user.twoFactorEnabled) {
      req.user = user; req.tenantId = user.tenantId;
      audit.log(req, 'auth.login-2fa-required', 'user', user._id, { email });
      const tempToken = issueTempToken(user._id);
      return success(res, { requires2FA: true, tempToken }, 'Two-factor code required');
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    req.user = user; req.tenantId = user.tenantId;

    const token = generateToken(user);
    audit.log(req, 'auth.login', 'user', user._id, { email });

    return success(res, {
      token,
      user: {
        _id: user._id, name: user.name, email: user.email,
        role: user.role, tenantId: user.tenantId,
      },
    }, 'Login successful');
  } catch (err) { next(err); }
};

// ── 2FA ──────────────────────────────────────────────────────────────────────
exports.verify2FALogin = async (req, res, next) => {
  try {
    const { tempToken, code } = req.body;
    const userId = verifyTempToken(tempToken);
    if (!userId) return error(res, 'Invalid or expired temp token — please log in again', 401);

    const user = await User.findById(userId).select('+twoFactorSecret +twoFactorBackupCodes');
    if (!user || !user.twoFactorEnabled) return error(res, 'Two-factor is not enabled', 400);

    let ok = speakeasy.totp.verify({
      secret: user.twoFactorSecret, encoding: 'base32', token: code, window: 1,
    });

    if (!ok && Array.isArray(user.twoFactorBackupCodes)) {
      for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
        if (await bcrypt.compare(code, user.twoFactorBackupCodes[i])) {
          ok = true;
          user.twoFactorBackupCodes.splice(i, 1);
          await user.save({ validateBeforeSave: false });
          req.user = user; req.tenantId = user.tenantId;
          audit.log(req, 'auth.2fa-backup-used', 'user', user._id, {
            remaining: user.twoFactorBackupCodes.length,
          });
          break;
        }
      }
    }

    if (!ok) {
      req.user = user; req.tenantId = user.tenantId;
      audit.log(req, 'auth.2fa-failed', 'user', user._id, {});
      return error(res, 'Invalid verification code', 401);
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    req.user = user; req.tenantId = user.tenantId;

    const token = generateToken(user);
    audit.log(req, 'auth.login', 'user', user._id, { via: '2fa' });

    return success(res, {
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
    }, 'Login successful');
  } catch (err) { next(err); }
};

exports.setup2FA = async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({ name: `NetVault (${req.user.email})`, length: 20 });
    await User.findByIdAndUpdate(req.user._id, {
      twoFactorSecret: secret.base32, twoFactorEnabled: false,
    });
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    return success(res, { secret: secret.base32, qrDataUrl, otpauthUrl: secret.otpauth_url },
      '2FA setup started — verify with a code to enable');
  } catch (err) { next(err); }
};

exports.verify2FASetup = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user.twoFactorSecret) return error(res, 'Run /2fa/setup first', 400);

    const ok = speakeasy.totp.verify({
      secret: user.twoFactorSecret, encoding: 'base32', token: req.body.code, window: 1,
    });
    if (!ok) return error(res, 'Invalid verification code', 401);

    const { plain, hashed } = await generateBackupCodes();
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = hashed;
    await user.save({ validateBeforeSave: false });
    audit.log(req, 'auth.2fa-enabled', 'user', user._id, {});
    return success(res, { enabled: true, backupCodes: plain }, 'Two-factor authentication enabled');
  } catch (err) { next(err); }
};

exports.disable2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(req.body.password))) {
      return error(res, 'Password is incorrect', 401);
    }
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = [];
    await user.save({ validateBeforeSave: false });
    audit.log(req, 'auth.2fa-disabled', 'user', user._id, {});
    return success(res, { enabled: false }, 'Two-factor authentication disabled');
  } catch (err) { next(err); }
};

// ── getMe, password flows ───────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('tenantId', 'orgName logo planName planStatus');
    return success(res, { user });
  } catch (err) { next(err); }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return success(res, {}, 'If that email exists, a reset link has been sent');

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await mailerService.sendPasswordResetEmail(email, user.name, resetUrl);

    req.user = user; req.tenantId = user.tenantId;
    audit.log(req, 'auth.password-reset-requested', 'user', user._id, { email });

    return success(res, {}, 'If that email exists, a reset link has been sent');
  } catch (err) { next(err); }
};

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

    req.user = user; req.tenantId = user.tenantId;
    audit.log(req, 'auth.password-reset-complete', 'user', user._id, {});
    return success(res, {}, 'Password reset successful');
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return error(res, 'Current password is incorrect', 400);
    }
    user.password = req.body.newPassword;
    await user.save();
    audit.log(req, 'auth.password-changed', 'user', user._id, {});
    return success(res, {}, 'Password changed successfully');
  } catch (err) { next(err); }
};