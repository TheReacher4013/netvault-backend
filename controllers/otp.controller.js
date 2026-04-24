const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OtpToken = require('../models/OtpToken.model');
const User = require('../models/User.model');
const mailerService = require('../services/mailer.service');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const generateCode = () => String(crypto.randomInt(100000, 1000000)); // 6 digits

// ── POST /api/otp/send ───────
exports.sendOtp = async (req, res, next) => {
    try {
        const rawEmail = (req.body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
            return error(res, 'Please provide a valid email address', 400);
        }
        const existingUser = await User.findOne({ email: rawEmail });
        if (existingUser) {
            logger.info(`[otp] Suppressed — email already registered: ${rawEmail}`);
            // Return same success so client flow looks identical
            return success(res, {
                sent: true,
                expiresInMinutes: OTP_EXPIRY_MINUTES,
            }, 'Verification code sent');
        }

        // Drop any prior unverified tokens for this email
        await OtpToken.deleteMany({ email: rawEmail, purpose: 'register', verified: false });

        const code = generateCode();
        const codeHash = await bcrypt.hash(code, 10);

        await OtpToken.create({
            email: rawEmail,
            codeHash,
            purpose: 'register',
            expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        });

        // Send email (don't block the response on SMTP slowness)
        mailerService.sendOtpEmail(rawEmail, code, OTP_EXPIRY_MINUTES).catch(err => {
            logger.error(`[otp] email failed for ${rawEmail}: ${err.message}`);
        });

        return success(res, {
            sent: true,
            expiresInMinutes: OTP_EXPIRY_MINUTES,
        }, 'Verification code sent');
    } catch (err) { next(err); }
};

// ── POST /api/otp/verify ────────
exports.verifyOtp = async (req, res, next) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const code = (req.body.code || '').trim();

        if (!email || !code) return error(res, 'Email and code are required', 400);

        const token = await OtpToken.findOne({
            email,
            purpose: 'register',
            expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 });

        if (!token) return error(res, 'Verification code expired or not found. Request a new one.', 400);

        if (token.verified) {
            return success(res, { verified: true }, 'Already verified');
        }

        if (token.attempts >= MAX_ATTEMPTS) {
            return error(res, 'Too many failed attempts. Request a new code.', 429);
        }

        const matches = await bcrypt.compare(code, token.codeHash);
        if (!matches) {
            token.attempts += 1;
            await token.save();
            return error(res, `Invalid code. ${MAX_ATTEMPTS - token.attempts} attempt(s) remaining.`, 400);
        }

        token.verified = true;
        token.verifiedAt = new Date();
        await token.save();

        return success(res, {
            verified: true,
        }, 'Email verified — you can now complete registration');
    } catch (err) { next(err); }
};

// ── Helper used by auth.controller.register() ────────
exports.isEmailVerified = async (email) => {
    const normalized = (email || '').trim().toLowerCase();
    const token = await OtpToken.findOne({
        email: normalized,
        purpose: 'register',
        verified: true,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    return !!token;
};

exports.consumeVerifiedToken = async (email) => {
    const normalized = (email || '').trim().toLowerCase();
    await OtpToken.deleteMany({ email: normalized, purpose: 'register' });
};