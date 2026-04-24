const crypto = require('crypto');
const { Client, Credential, Notification } = require('../models/index');
const User = require('../models/User.model');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { success, error } = require('../utils/apiResponse');
const mailerService = require('../services/mailer.service');
const audit = require('../utils/audit');
const logger = require('../utils/logger');

// ── GET /api/clients ─────────────────────────────────────────────────────
exports.getClients = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const query = { tenantId: req.tenantId };
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
    ];
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const options = {
      page: parseInt(page), limit: parseInt(limit),
      sort: { createdAt: -1 },
    };
    const result = await Client.paginate(query, options);
    return success(res, result);
  } catch (err) { next(err); }
};

// ── POST /api/clients ────────────────────────────────────────────────────
// Accepts optional `password`. If present, creates a linked User for portal login.
exports.addClient = async (req, res, next) => {
  try {
    const { name, email, phone, company, address, tags, password } = req.body;

    // If password is being set, make sure no User already exists with this email
    if (password) {
      if (password.length < 6) return error(res, 'Password must be at least 6 characters', 400);
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) return error(res, 'A user account with this email already exists', 400);
    }

    // Create the Client first (no userId yet)
    const client = await Client.create({
      name, email, phone, company, address, tags,
      tenantId: req.tenantId,
    });

    // If password given, create a User account and link it
    let portalAccess = false;
    if (password) {
      try {
        const user = await User.create({
          name, email, phone, password,
          role: 'client',
          tenantId: req.tenantId,
          isActive: true,
        });
        client.userId = user._id;
        await client.save();
        portalAccess = true;

        // Send welcome-to-portal email (best-effort)
        mailerService.sendClientPortalWelcome?.(email, name, req.user?.name).catch(e =>
          logger.warn(`Client portal welcome email failed: ${e.message}`)
        );
      } catch (userErr) {
        // User creation failed — roll back the Client too, to keep things consistent
        await Client.findByIdAndDelete(client._id).catch(() => { });
        throw userErr;
      }
    }

    await Notification.create({
      tenantId: req.tenantId,
      type: 'new_client',
      title: 'New Client Added',
      message: `Client ${client.name} has been added${portalAccess ? ' with portal access' : ''}.`,
      entityId: client._id, entityType: 'client', severity: 'info',
    });

    audit.log(req, 'client.create', 'client', client._id, {
      name: client.name, email, portalAccess,
    });

    const io = req.app.get('io');
    io?.to(`tenant-${req.tenantId}`).emit('client-added', client);

    return success(res, { client, portalAccess }, 'Client added', 201);
  } catch (err) { next(err); }
};

// ── GET /api/clients/:id ─────────────────────────────────────────────────
exports.getClient = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    return success(res, { client });
  } catch (err) { next(err); }
};

// ── PUT /api/clients/:id ─────────────────────────────────────────────────
exports.updateClient = async (req, res, next) => {
  try {
    const { name, email, phone, company, address, tags, isActive } = req.body;

    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { name, email, phone, company, address, tags, isActive },
      { new: true, runValidators: true }
    );
    if (!client) return error(res, 'Client not found', 404);

    // Keep linked User in sync
    if (client.userId) {
      await User.findByIdAndUpdate(client.userId, { name, email, phone, isActive }).catch(() => { });
    }

    return success(res, { client }, 'Client updated');
  } catch (err) { next(err); }
};

// ── DELETE /api/clients/:id ──────────────────────────────────────────────
exports.deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);

    // Also delete the linked User (if any)
    if (client.userId) {
      await User.findByIdAndDelete(client.userId).catch(() => { });
    }

    audit.log(req, 'client.delete', 'client', client._id, { name: client.name });
    return success(res, {}, 'Client deleted');
  } catch (err) { next(err); }
};

// ── GET /api/clients/:id/assets ──────────────────────────────────────────
exports.getClientAssets = async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const [client, domains, hosting] = await Promise.all([
      Client.findOne({ _id: clientId, tenantId: req.tenantId }),
      Domain.find({ clientId, tenantId: req.tenantId }).sort({ expiryDate: 1 }),
      Hosting.find({ clientId, tenantId: req.tenantId }).sort({ expiryDate: 1 }),
    ]);
    if (!client) return error(res, 'Client not found', 404);
    return success(res, { client, domains, hosting });
  } catch (err) { next(err); }
};

// ── POST /api/clients/:id/notes ──────────────────────────────────────────
exports.addNote = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    if (!req.body.content?.trim()) return error(res, 'Note content is required', 400);
    client.notes.push({ content: req.body.content.trim(), addedBy: req.user._id });
    await client.save();
    return success(res, { notes: client.notes }, 'Note added');
  } catch (err) { next(err); }
};

// ── POST /api/clients/:id/credentials ────────────────────────────────────
exports.addCredential = async (req, res, next) => {
  try {
    const { label, type, data, hostingId, domainId, notes } = req.body;
    const cred = new Credential({
      label, type, clientId: req.params.id,
      hostingId, domainId, notes,
      tenantId: req.tenantId,
      addedBy: req.user._id,
    });
    cred.data = data;
    await cred.save();
    return success(res, { credentialId: cred._id }, 'Credential stored securely', 201);
  } catch (err) { next(err); }
};

// ── GET /api/clients/:id/credentials ─────────────────────────────────────
exports.getCredentials = async (req, res, next) => {
  try {
    const creds = await Credential.find({ clientId: req.params.id, tenantId: req.tenantId })
      .populate('hostingId', 'label serverIP')
      .populate('domainId', 'name')
      .populate('addedBy', 'name');

    const decrypted = creds.map(c => ({
      _id: c._id,
      label: c.label,
      type: c.type,
      data: c.toObject().data,
      notes: c.notes,
      addedBy: c.addedBy,
      createdAt: c.createdAt,
      hostingId: c.hostingId,
      domainId: c.domainId,
    }));
    return success(res, { credentials: decrypted });
  } catch (err) { next(err); }
};

// ── DELETE /api/clients/:id/credentials/:credId ──────────────────────────
exports.deleteCredential = async (req, res, next) => {
  try {
    const cred = await Credential.findOneAndDelete({
      _id: req.params.credId,
      clientId: req.params.id,
      tenantId: req.tenantId,
    });
    if (!cred) return error(res, 'Credential not found', 404);
    return success(res, {}, 'Credential deleted');
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────────────────
// ✅ NEW ENDPOINTS — Portal access management
// ─────────────────────────────────────────────────────────────────────────

// ── POST /api/clients/:id/invite ─────────────────────────────────────────
// Generate an invite token and email the client a link to set their password.
exports.sendInvite = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    if (client.userId) return error(res, 'This client already has portal access', 400);

    // Check for email collision (another user owns this email)
    const existing = await User.findOne({ email: client.email.toLowerCase() });
    if (existing) return error(res, 'A user account already uses this email', 400);

    // Generate a raw token (sent in link) and store its hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    client.inviteToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    client.inviteTokenExpire = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    await client.save();

    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invite/${rawToken}`;

    await mailerService.sendClientInvite(
      client.email, client.name,
      req.user?.name || 'Your agency',
      inviteUrl
    );

    audit.log(req, 'client.invite-sent', 'client', client._id, { email: client.email });

    return success(res, { inviteUrl }, 'Invite email sent. Link expires in 7 days.');
  } catch (err) { next(err); }
};

// ── DELETE /api/clients/:id/portal-access ────────────────────────────────
exports.revokePortalAccess = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    if (!client.userId) return error(res, 'Client does not have portal access', 400);

    await User.findByIdAndDelete(client.userId).catch(() => { });
    client.userId = null;
    await client.save();

    audit.log(req, 'client.portal-revoked', 'client', client._id, { email: client.email });

    return success(res, { client }, 'Portal access revoked');
  } catch (err) { next(err); }
};