





const axios = require('axios');
const dns = require('dns').promises;
const logger = require('../utils/logger');

const RDAP_BASE = 'https://rdap.org/domain/';


exports.checkAvailability = async (domain) => {
  if (!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain)) {
    return { registered: null, reason: 'Invalid domain format', nameservers: [] };
  }

  try {
    const { data, status } = await axios.get(`${RDAP_BASE}${domain}`, {
      timeout: 6000,
      validateStatus: s => s === 200 || s === 404,
    });

    if (status === 404 || data?.errorCode === 404) {
      return {
        registered: false,
        reason: 'No RDAP record found — domain is likely available',
        nameservers: [],
        source: 'rdap',
      };
    }

    if (status === 200 && data?.ldhName) {
      const nameservers = Array.isArray(data.nameservers)
        ? data.nameservers.map(ns => ns.ldhName).filter(Boolean)
        : [];
      return {
        registered: true,
        reason: 'RDAP record found — domain is registered',
        nameservers,
        source: 'rdap',
      };
    }
  } catch (rdapErr) {
   
    logger.warn(`[whois] RDAP failed for ${domain}: ${rdapErr.message}, falling back to DNS`);
  }

  try {
    const [nsResult, soaResult] = await Promise.allSettled([
      dns.resolveNs(domain),
      dns.resolveSoa(domain),
    ]);

    const hasNs = nsResult.status === 'fulfilled' && nsResult.value?.length > 0;
    const hasSoa = soaResult.status === 'fulfilled';

  
    if (hasNs && hasSoa) {
      return {
        registered: true,
        reason: 'NS and SOA records found — domain is registered',
        nameservers: nsResult.value || [],
        source: 'dns',
      };
    }

    if (hasNs && !hasSoa) {
 
      return {
        registered: null,
        reason: 'NS records found but no SOA — result is uncertain. Check a registrar to confirm.',
        nameservers: nsResult.value || [],
        source: 'dns',
      };
    }

  
    const code = nsResult.reason?.code || '';
    if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL'].includes(code)) {
      return {
        registered: false,
        reason: 'No DNS records found — domain is likely available',
        nameservers: [],
        source: 'dns',
      };
    }

    return {
      registered: null,
      reason: `DNS lookup inconclusive (${code}) — verify manually`,
      nameservers: [],
      source: 'dns',
    };

  } catch (dnsErr) {
    return {
      registered: null,
      reason: `Lookup failed: ${dnsErr.message}`,
      nameservers: [],
      source: 'error',
    };
  }
};


exports.lookupWhois = async (domain) => {
  try {
    const { data } = await axios.get(`${RDAP_BASE}${domain}`, {
      timeout: 8000,
      validateStatus: s => s === 200 || s === 404,
    });

    if (!data || data.errorCode === 404) {
      return { found: false, data: null };
    }

    const events = Array.isArray(data.events) ? data.events : [];
    const eventOf = (action) => events.find(e => e.eventAction === action)?.eventDate;

    const entities = Array.isArray(data.entities) ? data.entities : [];
    const registrar = entities.find(e => Array.isArray(e.roles) && e.roles.includes('registrar'));
    const registrarName = registrar?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3];

    const registrant = entities.find(e => Array.isArray(e.roles) && e.roles.includes('registrant'));
    const registrantName = registrant?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3];
    const registrantEmail = registrant?.vcardArray?.[1]?.find(v => v[0] === 'email')?.[3];
    const registrantOrg = registrant?.vcardArray?.[1]?.find(v => v[0] === 'org')?.[3];

    const nameservers = Array.isArray(data.nameservers)
      ? data.nameservers.map(ns => ns.ldhName).filter(Boolean)
      : [];

    const statuses = Array.isArray(data.status) ? data.status : [];

    return {
      found: true,
      data: {
        domain: data.ldhName || domain,
        registrar: registrarName || null,
        registrationDate: eventOf('registration') || null,
        lastChanged: eventOf('last changed') || null,
        expiryDate: eventOf('expiration') || null,
        nameservers,
        statuses,
        registrantName,
        registrantEmail,
        registrantOrg,
        rawData: JSON.stringify(data).slice(0, 20000),
      },
    };
  } catch (err) {
    logger.warn(`[whois] RDAP lookup failed for ${domain}: ${err.message}`);
    return { found: false, data: null, error: err.message };
  }
};