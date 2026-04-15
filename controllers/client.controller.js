const { Client, Credential, Notification } = require('../models/index');
const Domain = require('../models/Domain.model');
const Hosting = require('../models/Hosting.model');
const { success, error } = require('../utils/apiResponse');

// @GET /api/clients
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

// @POST /api/clients
exports.addClient = async (req, res, next) => {
  try {
    const client = await Client.create({ ...req.body, tenantId: req.tenantId });
    await Notification.create({
      tenantId: req.tenantId,
      type: 'new_client',
      title: 'New Client Added',
      message: `Client ${client.name} has been added.`,
      entityId: client._id, entityType: 'client', severity: 'info',
    });
    const io = req.app.get('io');
    io?.to(`tenant-${req.tenantId}`).emit('client-added', client);
    return success(res, { client }, 'Client added', 201);
  } catch (err) { next(err); }
};

// @GET /api/clients/:id
exports.getClient = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    return success(res, { client });
  } catch (err) { next(err); }
};

// @PUT /api/clients/:id
exports.updateClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body, { new: true, runValidators: true }
    );
    if (!client) return error(res, 'Client not found', 404);
    return success(res, { client }, 'Client updated');
  } catch (err) { next(err); }
};

// @DELETE /api/clients/:id
exports.deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    return success(res, {}, 'Client deleted');
  } catch (err) { next(err); }
};

// @GET /api/clients/:id/assets
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

// @POST /api/clients/:id/notes
exports.addNote = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!client) return error(res, 'Client not found', 404);
    client.notes.push({ content: req.body.content, addedBy: req.user._id });
    await client.save();
    return success(res, { notes: client.notes }, 'Note added');
  } catch (err) { next(err); }
};

// @POST /api/clients/:id/credentials
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

// @GET /api/clients/:id/credentials
exports.getCredentials = async (req, res, next) => {
  try {
    const creds = await Credential.find({ clientId: req.params.id, tenantId: req.tenantId })
      .populate('hostingId', 'label serverIP')
      .populate('domainId', 'name')
      .populate('addedBy', 'name');

    const decrypted = creds.map(c => ({
      _id: c._id, label: c.label, type: c.type,
      data: c.toObject().data,
      notes: c.notes, addedBy: c.addedBy, createdAt: c.createdAt,
      hostingId: c.hostingId, domainId: c.domainId,
    }));
    return success(res, { credentials: decrypted });
  } catch (err) { next(err); }
};

// @DELETE /api/clients/:clientId/credentials/:credId
exports.deleteCredential = async (req, res, next) => {
  try {
    const cred = await Credential.findOneAndDelete({
      _id: req.params.credId, clientId: req.params.id, tenantId: req.tenantId,
    });
    if (!cred) return error(res, 'Credential not found', 404);
    return success(res, {}, 'Credential deleted');
  } catch (err) { next(err); }
};
