const EmailTemplate = require('../models/EmailTemplate.model');
const { success, error } = require('../utils/apiResponse');


exports.renderTemplate = async (templateId, vars = {}) => {
    const t = await EmailTemplate.findOne({ templateId });
    if (!t) throw new Error(`Email template not found: ${templateId}`);

    const fill = (str) =>
        (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

    const isOtp = templateId === 'otp';

    const highlightHtml = t.highlight
        ? isOtp
            ? `<div style="background:#F5F5F0;border:2px dashed ${t.hlColor};border-radius:12px;padding:20px;text-align:center;margin:18px 0;">
           <div style="font-family:'Courier New',monospace;font-size:34px;font-weight:900;letter-spacing:12px;color:${t.hlColor};">${fill(t.highlight)}</div>
         </div>`
            : `<div style="background:${t.hlBg};border-left:4px solid ${t.hlColor};padding:14px 18px;border-radius:6px;margin:16px 0;">${fill(t.highlight)}</div>`
        : '';

    const btnHtml = t.btnText
        ? `<a href="${fill(t.btnUrl)}" style="display:inline-block;background:${t.btnColor};color:${t.btnTxtColor}!important;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;">${fill(t.btnText)}</a>`
        : '';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;}
  .card{background:#fff;max-width:580px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);}
  .body{padding:28px 32px;color:#333;}
  .body p{margin:0 0 12px;font-size:14px;line-height:1.7;}
</style>
</head>
<body>
<div class="card">
  <div style="background:${t.hdrColor};padding:28px 32px;">
    <h1 style="color:${t.hdrTxtColor};margin:0;font-size:22px;">${fill(t.headerTitle)}</h1>
    <p style="color:${t.hdrTxtColor};opacity:.75;margin:4px 0 0;font-size:13px;">${fill(t.headerSub)}</p>
  </div>
  <div class="body">
    ${t.greeting ? `<h2 style="margin:0 0 12px;">${fill(t.greeting)}</h2>` : ''}
    ${t.body ? `<p>${fill(t.body)}</p>` : ''}
    ${highlightHtml}
    ${btnHtml}
  </div>
  <div style="padding:18px 32px;background:${t.footerBg};border-top:1px solid #E8F0EC;font-size:12px;color:${t.footerTxt};text-align:center;">
    ${fill(t.footer)}
  </div>
</div>
</body>
</html>`;

    return { html, subject: fill(t.subject) };
};

// ── CRUD Routes ──────────────────────────────────────────────────────────────

// GET /api/super-admin/email-templates
exports.getAllTemplates = async (req, res) => {
    try {
        const templates = await EmailTemplate.find().sort('templateId').lean();
        return success(res, templates);
    } catch (err) {
        return error(res, err.message);
    }
};

// GET /api/super-admin/email-templates/:templateId
exports.getTemplate = async (req, res) => {
    try {
        const t = await EmailTemplate.findOne({ templateId: req.params.templateId });
        if (!t) return error(res, 'Template not found', 404);
        return success(res, t);
    } catch (err) {
        return error(res, err.message);
    }
};

// PUT /api/super-admin/email-templates/:templateId  (full update)
exports.updateTemplate = async (req, res) => {
    try {
        const allowed = [
            'subject', 'headerTitle', 'headerSub', 'greeting', 'body',
            'highlight', 'btnText', 'btnUrl', 'footer',
            'hdrColor', 'hdrTxtColor', 'hlColor', 'hlBg',
            'btnColor', 'btnTxtColor', 'footerBg', 'footerTxt',
        ];
        const update = {};
        allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
        update.updatedBy = req.user._id;

        const t = await EmailTemplate.findOneAndUpdate(
            { templateId: req.params.templateId },
            { $set: update },
            { new: true, runValidators: true }
        );
        if (!t) return error(res, 'Template not found', 404);
        return success(res, t, 'Template updated');
    } catch (err) {
        return error(res, err.message);
    }
};

// POST /api/super-admin/email-templates/:templateId/reset
exports.resetTemplate = async (req, res) => {
    try {
        // Re-run the seed defaults inline for the requested templateId
        const DEFAULTS = require('../scripts/seedEmailTemplates').DEFAULTS;
        if (!DEFAULTS) return error(res, 'Seed defaults not exported', 500);
        const def = DEFAULTS.find(d => d.templateId === req.params.templateId);
        if (!def) return error(res, 'Default not found', 404);
        const t = await EmailTemplate.findOneAndUpdate(
            { templateId: req.params.templateId },
            { $set: { ...def, updatedBy: req.user._id } },
            { new: true }
        );
        return success(res, t, 'Template reset to defaults');
    } catch (err) {
        return error(res, err.message);
    }
};

// POST /api/super-admin/email-templates/:templateId/preview  (send test email)
exports.sendPreview = async (req, res) => {
    try {
        const { to } = req.body;
        if (!to) return error(res, 'Recipient email required', 400);

        const { html, subject } = await exports.renderTemplate(req.params.templateId, {
            userName: 'Test User', agencyName: 'Test Agency', domainName: 'example.com',
            daysLeft: '7', otpCode: '4 8 2 9 1 7', invoiceNo: 'INV-0001', amount: '5000',
            dueDate: '31 May 2025', planName: 'Pro', oldPlan: 'Starter', newPlan: 'Pro',
            title: 'Test Announcement', content: 'This is a preview of the announcement email.',
            dashboardUrl: process.env.FRONTEND_URL + '/dashboard',
            resetUrl: process.env.FRONTEND_URL + '/reset-password/test-token',
        });

        const { sendMail } = require('../services/mailer.service');
        await sendMail(to, `[Preview] ${subject}`, html);

        return success(res, null, `Preview sent to ${to}`);
    } catch (err) {
        return error(res, err.message);
    }
};