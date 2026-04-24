const crypto = require('crypto');
const { Client } = require('../models/index');
const User = require('../models/User.model');
const generateToken = require('../utils/generateToken');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// ── GET /api/invite/verify/:token ──────
exports.verifyInvite = async (req, res, next) => {
    try {
        const hashed = hashToken(req.params.token);
        const client = await Client.findOne({
            inviteToken: hashed,
            inviteTokenExpire: { $gt: Date.now() },
        }).select('+inviteToken +inviteTokenExpire');

        if (!client) return error(res, 'Invalid or expired invite link', 400);
        if (client.userId) return error(res, 'This invite has already been accepted', 400);
        return success(res, {
            name: client.name,
            email: client.email,
            company: client.company,
        });
    } catch (err) { next(err); }
};

// ── POST /api/invite/accept/:token ─────
exports.acceptInvite = async (req, res, next) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return error(res, 'Password must be at least 6 characters', 400);
        }

        const hashed = hashToken(req.params.token);
        const client = await Client.findOne({
            inviteToken: hashed,
            inviteTokenExpire: { $gt: Date.now() },
        }).select('+inviteToken +inviteTokenExpire');

        if (!client) return error(res, 'Invalid or expired invite link', 400);
        if (client.userId) return error(res, 'This invite has already been accepted', 400);

        // Double-check no user has taken this email meanwhile
        const existing = await User.findOne({ email: client.email.toLowerCase() });
        if (existing) return error(res, 'A user account already exists with this email', 400);

        // Create the User with role=client under the same tenant
        const user = await User.create({
            name: client.name,
            email: client.email,
            phone: client.phone,
            password,
            role: 'client',
            tenantId: client.tenantId,
            isActive: true,
        });

        // Link + clear invite token
        client.userId = user._id;
        client.inviteToken = undefined;
        client.inviteTokenExpire = undefined;
        await client.save();

        // Attach user to req so audit picks up tenantId
        req.user = user;
        req.tenantId = client.tenantId;
        audit.log(req, 'client.invite-accepted', 'client', client._id, { email: client.email });

        const token = generateToken(user);

        return success(res, {
            token,
            user: {
                _id: user._id, name: user.name, email: user.email,
                role: user.role, tenantId: user.tenantId,
            },
        }, 'Account created — you are now logged in', 201);
    } catch (err) { next(err); }
};