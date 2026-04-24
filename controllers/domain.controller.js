const Domain = require('../models/Domain.model');
const { Notification } = require('../models/index');
const { success, error } = require('../utils/apiResponse');
const csv = require('csv-parser');
const fs = require('fs');

exports.getDomains = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search, clientId, sortBy = 'expiryDate', order = 'asc' } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status;
    if (clientId) query.clientId = clientId;
    if (search) query.name = { $regex: search, $options: 'i' };

    const result = await Domain.paginate(query, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: order === 'asc' ? 1 : -1 },
      populate: [
        { path: 'clientId', select: 'name email' },
        { path: 'hostingId', select: 'label serverIP planType' },
      ],
    });
    return success(res, result);
  } catch (err) { next(err); }
};

exports.addDomain = async (req, res, next) => {
  try {
    const {
      name, registrar, registrationDate, expiryDate, clientId,
      autoRenewal, isLive, nameservers, whois, notes, tags,
      renewalCost, parentDomainId, hostingId,
    } = req.body;

    // Validate expiry date must be in the future
    if (!expiryDate) return error(res, 'Expiry date is required', 400);
    const expiry = new Date(expiryDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // compare at day level
    if (expiry <= now) return error(res, 'Expiry date must be in the future', 400);

    // Build clean URL/name
    const cleanName = (name || '').toLowerCase().trim()
      .replace(/^https?:\/\//, '').replace(/^www\./, '');

    if (!cleanName) return error(res, 'Domain name is required', 400);

    if (parentDomainId) {
      const parent = await Domain.findOne({ _id: parentDomainId, tenantId: req.tenantId });
      if (!parent) return error(res, 'Parent domain not found in your account', 400);
      if (parent.isSubdomain) return error(res, 'Cannot create a subdomain of a subdomain', 400);
    }

    // Validate hosting if provided
    if (hostingId) {
      const Hosting = require('../models/Hosting.model');
      const hosting = await Hosting.findOne({ _id: hostingId, tenantId: req.tenantId });
      if (!hosting) return error(res, 'Hosting not found in your account', 400);
    }

    const domain = await Domain.create({
      name: cleanName,
      url: cleanName,
      registrar, registrationDate, expiryDate, clientId,
      autoRenewal: autoRenewal || false,
      isLive: isLive !== undefined ? isLive : true,
      nameservers, whois, notes, tags,
      renewalCost,
      parentDomainId: parentDomainId || null,
      hostingId: hostingId || null,
      tenantId: req.tenantId,
    });
    await domain.populate('clientId', 'name email');
    await domain.populate('hostingId', 'label serverIP planType');

    await Notification.create({
      tenantId: req.tenantId, type: 'info',
      title: 'New Domain Added',
      message: `Domain ${domain.name} has been added successfully.`,
      entityId: domain._id, entityType: 'domain', severity: 'info',
    });

    const io = req.app.get('io');
    io?.to(`tenant-${req.tenantId}`).emit('domain-added', domain);

    return success(res, { domain }, 'Domain added successfully', 201);
  } catch (err) { next(err); }
};

exports.getDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('clientId', 'name email phone')
      .populate('parentDomainId', 'name expiryDate status')
      .populate({ path: 'subdomains', select: 'name expiryDate status' })
      .populate('hostingId', 'label serverIP planType provider controlPanel');

    if (!domain) return error(res, 'Domain not found', 404);
    return success(res, { domain });
  } catch (err) { next(err); }
};

//  FIX: Uses .save() so pre('save') hook recomputes status
exports.updateDomain = async (req, res, next) => {
  try {
    const {
      name, registrar, registrationDate, expiryDate,
      autoRenewal, isLive, nameservers, whois, notes,
      tags, renewalCost, clientId,
      transferStatus, parentDomainId, hostingId,
    } = req.body;

    // Validate expiry date must be in the future
    if (expiryDate !== undefined) {
      const expiry = new Date(expiryDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (expiry <= now) return error(res, 'Expiry date must be in the future', 400);
    }

    if (parentDomainId !== undefined) {
      if (parentDomainId && parentDomainId === req.params.id) {
        return error(res, 'A domain cannot be its own parent', 400);
      }
      if (parentDomainId) {
        const parent = await Domain.findOne({ _id: parentDomainId, tenantId: req.tenantId });
        if (!parent) return error(res, 'Parent domain not found in your account', 400);
        if (parent.isSubdomain) return error(res, 'Cannot nest subdomains', 400);
      }
    }

    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);

    if (name !== undefined) {
      const cleanName = name.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
      domain.name = cleanName;
      domain.url = cleanName;
    }
    if (registrar !== undefined) domain.registrar = registrar;
    if (registrationDate !== undefined) domain.registrationDate = registrationDate;
    if (expiryDate !== undefined) domain.expiryDate = expiryDate;
    if (autoRenewal !== undefined) domain.autoRenewal = autoRenewal;
    if (isLive !== undefined) domain.isLive = isLive;
    if (nameservers !== undefined) domain.nameservers = nameservers;
    if (whois !== undefined) domain.whois = whois;
    if (notes !== undefined) domain.notes = notes;
    if (tags !== undefined) domain.tags = tags;
    if (renewalCost !== undefined) domain.renewalCost = renewalCost;
    if (clientId !== undefined) domain.clientId = clientId || null;
    if (transferStatus !== undefined) domain.transferStatus = transferStatus;
    if (parentDomainId !== undefined) domain.parentDomainId = parentDomainId || null;
    if (hostingId !== undefined) domain.hostingId = hostingId || null;

    await domain.save();
    await domain.populate('clientId', 'name email');
    await domain.populate('hostingId', 'label serverIP planType');

    return success(res, { domain }, 'Domain updated');
  } catch (err) { next(err); }
};

exports.deleteDomain = async (req, res, next) => {
  try {
    const childCount = await Domain.countDocuments({
      parentDomainId: req.params.id,
      tenantId: req.tenantId,
    });
    if (childCount > 0) {
      return error(res, `Cannot delete: this domain has ${childCount} subdomain(s). Delete or reassign them first.`, 400);
    }
    const domain = await Domain.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    return success(res, {}, 'Domain deleted');
  } catch (err) { next(err); }
};

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

exports.addDNSRecord = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    domain.dnsRecords.push(req.body);
    await domain.save();
    return success(res, { dnsRecords: domain.dnsRecords }, 'DNS record added', 201);
  } catch (err) { next(err); }
};

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

exports.deleteDNSRecord = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!domain) return error(res, 'Domain not found', 404);
    domain.dnsRecords.pull(req.params.recordId);
    await domain.save();
    return success(res, { dnsRecords: domain.dnsRecords }, 'DNS record deleted');
  } catch (err) { next(err); }
};

exports.importDomainsCSV = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No CSV file uploaded', 400);
    const results = [];
    let responded = false;

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('error', (streamErr) => {
        if (responded) return;
        responded = true;
        if (fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (_) { }
        }
        next(streamErr);
      })
      .on('end', async () => {
        if (responded) return;
        responded = true;

        const created = [], errors = [];
        for (const row of results) {
          try {
            const expiryRaw = row.expiryDate || row.expiry;
            if (!expiryRaw) {
              errors.push({ name: row.name || row.domain, error: 'Missing expiry date' });
              continue;
            }
            const doc = await Domain.create({
              name: (row.name || row.domain || '').toLowerCase().trim(),
              registrar: row.registrar,
              expiryDate: new Date(expiryRaw),
              tenantId: req.tenantId,
            });
            created.push(doc.name);
          } catch (e) {
            errors.push({ name: row.name || row.domain, error: e.message });
          }
        }

        if (fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (_) { }
        }
        return success(res, { imported: created.length, errors }, `${created.length} domains imported`);
      });
  } catch (err) { next(err); }
};

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

