const axios = require('axios');
const https = require('https');
const Domain = require('../models/Domain.model');
const { success, error } = require('../utils/apiResponse');

const REQUEST_TIMEOUT = 8000;

const probeDomain = async (domainName) => {
    for (const scheme of ['https', 'http']) {
        try {
            const start = Date.now();
            const res = await axios.get(`${scheme}://${domainName}`, {
                timeout: REQUEST_TIMEOUT,
                maxRedirects: 5,
                validateStatus: () => true,
                httpsAgent: scheme === 'https'
                    ? new https.Agent({ rejectUnauthorized: false })
                    : undefined,
            });
            return {
                status: 'up',
                scheme,
                statusCode: res.status,
                responseTime: Date.now() - start,
                error: null,
            };
        } catch (err) {
            // try next scheme
            if (scheme === 'http') {
                return { status: 'down', scheme: null, statusCode: null, responseTime: null, error: err.message };
            }
        }
    }
    return { status: 'down', scheme: null, statusCode: null, responseTime: null, error: 'All probes failed' };
};

// ── @POST /api/domains/:id/check ─────────────────────────────────────────
exports.checkNow = async (req, res, next) => {
    try {
        const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (!domain) return error(res, 'Domain not found', 404);

        const result = await probeDomain(domain.name);
        const now = new Date();
        const isNowDown = result.status === 'down';

        // Update monitoring state — but do NOT touch lastAlertAt (only the cron
        // job manages alert throttling; manual checks shouldn't reset the timer)
        domain.monitoring = {
            lastChecked: now,
            currentState: result.status,
            lastDownAt: isNowDown ? now : domain.monitoring?.lastDownAt,
            lastUpAt: !isNowDown ? now : domain.monitoring?.lastUpAt,
            lastAlertAt: domain.monitoring?.lastAlertAt,  // unchanged
        };
        await domain.save();

        return success(res, {
            domain: {
                _id: domain._id,
                name: domain.name,
                monitoring: domain.monitoring,
                probeResult: result,
            },
        }, `Domain is ${result.status.toUpperCase()}`);
    } catch (err) { next(err); }
};