const Domain = require('../models/Domain.model');
const { Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const csv = require('csv-parser');
const fs = require('fs');

// @GET /api/domains
exports.getDomains = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search, clientId, sortBy = 'expiryDate', order = 'asc' } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status;
    if (clientId) query.clientId = clientId;
    if (search) query.name = { $regex: search, $options: 'i' };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: order === 'asc' ? 1 : -1 },
      populate: { path: 'clientId', select: 'name email' },
    };

    const result = await Domain.paginate(query, options);
    return success(res, result);
  } catch (err) { next(err); }
};

// @POST /api/domains
exports.addDomain = async (req, res, next) => {
  try {
    const domain = await Domain.create({ ...req.body, tenantId: req.tenantId });
    await domain.populate('clientId', 'name email');

    // Notify
    await Notification.create({
      tenantId: req.tenantId,
      type: 'info',
      title: 'New Domain Added',
      message: `Domain ${domain.name} has been added successfully.`,
      entityId: domain._id, entityType: 'domain', severity: 'info',
    });

    const io = req.app.get('io');
    io?.to(`tenant-${req.tenantId}`).emit('domain-added', domain);

    return success(res, { domain }, 'Domain added successfully', 201);
  } catch (err) { next(err); }
};

// @GET /api/domains/:id
exports.getDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone');
    if (!domain) return error(res, 'Domain not found', 404);
    return success(res, { domain });
  } catch (err) { next(err); }
};

// @PUT /api/domains/:id
exports.updateDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body, { new: true, runValidators: true }
    ).populate('clientId', 'name email');
    if (!domain) return error(res, 'Domain not found', 404);
    return success(res, { domain }, 'Domain updated');
  } catch (err) { next(err); }
};

// @DELETE /api/domains/:id
exports.deleteDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    return success(res, {}, 'Domain deleted');
  } catch (err) { next(err); }
};

// @GET /api/domains/expiring?days=30
exports.getExpiringDomains = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const domains = await Domain.find({
      tenantId: req.tenantId,
      expiryDate: { $gte: new Date(), $lte: futureDate },
    }).populate('clientId', 'name email').sort({ expiryDate: 1 });

    return success(res, { domains, count: domains.length });
  } catch (err) { next(err); }
};

// @POST /api/domains/:id/dns  — Add DNS record
exports.addDNSRecord = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    domain.dnsRecords.push(req.body);
    await domain.save();
    return success(res, { dnsRecords: domain.dnsRecords }, 'DNS record added', 201);
  } catch (err) { next(err); }
};

// @PUT /api/domains/:id/dns/:recordId
exports.updateDNSRecord = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    const record = domain.dnsRecords.id(req.params.recordId);
    if (!record) return error(res, 'DNS record not found', 404);
    Object.assign(record, req.body);
    await domain.save();
    return success(res, { dnsRecords: domain.dnsRecords }, 'DNS record updated');
  } catch (err) { next(err); }
};

// @DELETE /api/domains/:id/dns/:recordId
exports.deleteDNSRecord = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    domain.dnsRecords.pull(req.params.recordId);
    await domain.save();
    return success(res, { dnsRecords: domain.dnsRecords }, 'DNS record deleted');
  } catch (err) { next(err); }
};

// @POST /api/domains/import-csv
exports.importDomainsCSV = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No CSV file uploaded', 400);
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('end', async () => {
        const created = [];
        const errors = [];
        for (const row of results) {
          try {
            const doc = await Domain.create({
              name: row.name || row.domain,
              registrar: row.registrar,
              expiryDate: new Date(row.expiryDate || row.expiry),
              tenantId: req.tenantId,
            });
            created.push(doc.name);
          } catch (e) {
            errors.push({ name: row.name, error: e.message });
          }
        }
        fs.unlinkSync(req.file.path);
        return success(res, { imported: created.length, errors }, `${created.length} domains imported`);
      });
  } catch (err) { next(err); }
};

// @GET /api/domains/stats
exports.getDomainStats = async (req, res, next) => {
  try {
    const [total, active, expiring, expired, transfer] = await Promise.all([
      Domain.countDocuments({ tenantId: req.tenantId }),
      Domain.countDocuments({ tenantId: req.tenantId, status: 'active' }),
      Domain.countDocuments({ tenantId: req.tenantId, status: 'expiring' }),
      Domain.countDocuments({ tenantId: req.tenantId, status: 'expired' }),
      Domain.countDocuments({ tenantId: req.tenantId, status: 'transfer' }),
    ]);
    return success(res, { total, active, expiring, expired, transfer });
  } catch (err) { next(err); }
};
