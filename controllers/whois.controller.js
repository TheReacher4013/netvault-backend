const Domain = require('../models/Domain.model');
const whoisService = require('../services/whois.service');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');

exports.checkAvailability = async (req, res, next) => {
    try {
        const name = (req.query.name || '').trim().toLowerCase();
        if (!name) return error(res, 'Query param "name" is required', 400);

        const result = await whoisService.checkAvailability(name);
        return success(res, { domain: name, ...result });
    } catch (err) { next(err); }
};


exports.lookup = async (req, res, next) => {
    try {
        const name = (req.query.name || '').trim().toLowerCase();
        if (!name) return error(res, 'Query param "name" is required', 400);

        const result = await whoisService.lookupWhois(name);
        if (!result.found) {
            return success(res, { found: false, domain: name }, 'No WHOIS record found');
        }
        return success(res, { found: true, ...result.data });
    } catch (err) { next(err); }
};

// @POST /api/whois/refresh/:id  — Re-fetch WHOIS for a domain we track
// Persists results to Domain.whois
exports.refreshDomainWhois = async (req, res, next) => {
    try {
        const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (!domain) return error(res, 'Domain not found', 404);

        const result = await whoisService.lookupWhois(domain.name);
        if (!result.found) {
            return error(res, 'Could not find WHOIS data for this domain', 404);
        }

        const d = result.data;
        domain.whois = {
            registrantName: d.registrantName || domain.whois?.registrantName,
            registrantEmail: d.registrantEmail || domain.whois?.registrantEmail,
            registrantOrg: d.registrantOrg || domain.whois?.registrantOrg,
            updatedDate: d.lastChanged ? new Date(d.lastChanged) : domain.whois?.updatedDate,
            rawData: d.rawData,
            lastFetched: new Date(),
        };

        // Opportunistically update other fields if we got better info
        if (d.registrar && !domain.registrar) domain.registrar = d.registrar;
        if (d.nameservers?.length && (!domain.nameservers || domain.nameservers.length === 0)) {
            domain.nameservers = d.nameservers;
        }
        if (d.registrationDate && !domain.registrationDate) {
            domain.registrationDate = new Date(d.registrationDate);
        }

        await domain.save();

        audit.log(req, 'domain.whois-refresh', 'domain', domain._id, { name: domain.name });
        return success(res, { domain }, 'WHOIS data refreshed');
    } catch (err) { next(err); }
};
