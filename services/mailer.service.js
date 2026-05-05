const nodemailer = require('nodemailer');
const logger = require('../utils/logger');


let _transporter = null;

const getTransporter = () => {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT) || 587,
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
      pool: true,
      maxConnections: 5,
      rateDelta: 1000,
      rateLimit: 10,
    });
  }
  return _transporter;
};

const sendMail = exports.sendMail = async (to, subject, html) => {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'NetVault <noreply@netvault.app>',
      to, subject, html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email failed to ${to}: ${err.message}`);
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err.code)) {
      _transporter = null;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// renderTemplate — DB se HTML + subject lata hai
// ─────────────────────────────────────────────────────────────────────────────
const renderTemplate = async (templateId, vars = {}) => {
  const EmailTemplate = require('../models/EmailTemplate.model');
  const t = await EmailTemplate.findOne({ templateId }).lean();

  // agar DB mein template nahi mila toh error throw karo
  if (!t) throw new Error(`Email template not found in DB: ${templateId}`);

  const fill = (str) =>
    (str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

  const isOtp = templateId === 'otp';

  const highlightHtml = t.highlight
    ? isOtp
      ? `<div style="background:#F5F5F0;border:2px dashed ${t.hlColor};border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
           <div style="font-family:'Courier New',monospace;font-size:36px;font-weight:900;letter-spacing:12px;color:${t.hlColor};">${fill(t.highlight)}</div>
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
  .body h2{margin:0 0 12px;}
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
    ${t.greeting ? `<h2>${fill(t.greeting)}</h2>` : ''}
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

// ─────────────────────────────────────────────────────────────────────────────
// Send functions — sab DB se render hote hain
// ─────────────────────────────────────────────────────────────────────────────

exports.sendWelcomeEmail = async (email, name, orgName) => {
  const { html, subject } = await renderTemplate('welcome', {
    agencyName: orgName,
    dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
  });
  await sendMail(email, subject, html);
};

exports.sendPasswordResetEmail = async (email, name, resetUrl) => {
  const { html, subject } = await renderTemplate('reset', { userName: name, resetUrl });
  await sendMail(email, subject, html);
};

exports.sendOtpEmail = async (email, code, expiryMinutes) => {
  const { html, subject } = await renderTemplate('otp', { otpCode: code });
  await sendMail(email, subject, html);
};

exports.sendDomainExpiryAlert = async (email, name, domain, daysLeft) => {
  const templateId = daysLeft <= 7 ? 'domain-urgent' : 'domain-warn';
  const { html, subject } = await renderTemplate(templateId, {
    userName: name, domainName: domain, daysLeft,
    domainUrl: `${process.env.FRONTEND_URL}/domains`,
  });
  await sendMail(email, subject, html);
};

exports.sendHostingExpiryAlert = async (email, name, hosting, daysLeft) => {
  const { html, subject } = await renderTemplate('hosting', {
    userName: name, hostingPlan: hosting, domainName: hosting, daysLeft,
    hostingUrl: `${process.env.FRONTEND_URL}/hosting`,
  });
  await sendMail(email, subject, html);
};

exports.sendSSLExpiryAlert = async (email, name, domain, daysLeft) => {
  const { html, subject } = await renderTemplate('ssl', {
    userName: name, domainName: domain, daysLeft,
    domainUrl: `${process.env.FRONTEND_URL}/hosting`,
  });
  await sendMail(email, subject, html);
};

exports.sendServerDownAlert = async (email, name, server) => {
  const { html, subject } = await renderTemplate('serverdown', {
    userName: name, serverName: server, serverIp: server,
    uptimeUrl: `${process.env.FRONTEND_URL}/uptime`,
  });
  await sendMail(email, subject, html);
};

// ⚠️  Invoice: PDF attachment preserve kiya hai — sendMail use nahi kiya
exports.sendInvoiceEmail = async (email, name, invoiceNo, total, dueDate, pdfPath = null) => {
  const fmtTotal = Number(total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtDate = new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const { html, subject } = await renderTemplate('invoice', {
    userName: name, invoiceNo,
    amount: fmtTotal, dueDate: fmtDate,
    invoiceUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing`,
  });

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: process.env.MAIL_FROM || 'NetVault <noreply@netvault.app>',
      to: email, subject, html,
    };

    // PDF attachment — original logic preserved
    if (pdfPath) {
      const fs = require('fs');
      if (fs.existsSync(pdfPath)) {
        mailOptions.attachments = [{
          filename: `${invoiceNo}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf',
        }];
      }
    }

    await transporter.sendMail(mailOptions);
    logger.info(`Invoice email sent to ${email}: ${invoiceNo}`);
  } catch (err) {
    logger.error(`Invoice email failed to ${email}: ${err.message}`);
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err.code)) {
      _transporter = null;
    }
    throw err;
  }
};

exports.sendClientInvite = async (email, clientName, agencyName, inviteUrl) => {
  const { html, subject } = await renderTemplate('invite', { clientName, agencyName, inviteUrl });
  await sendMail(email, subject, html);
};

exports.sendClientPortalWelcome = async (email, clientName, agencyName) => {
  const { html, subject } = await renderTemplate('portal-welcome', {
    clientName, agencyName,
    loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`,
  });
  await sendMail(email, subject, html);
};

exports.sendPlanChangeEmail = async (email, adminName, orgName, oldPlan, newPlan) => {
  const { html, subject } = await renderTemplate('plan-change', {
    userName: adminName, agencyName: orgName, oldPlan, newPlan,
    plansUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/company`,
  });
  await sendMail(email, subject, html);
};

exports.sendPlanActivatedEmail = async (email, adminName, orgName, planName) => {
  const { html, subject } = await renderTemplate('plan-activated', {
    userName: adminName, agencyName: orgName, planName,
    dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
  });
  await sendMail(email, subject, html);
};

exports.sendPlanRejectedEmail = async (email, adminName, orgName, reason) => {
  const { html, subject } = await renderTemplate('plan-rejected', {
    userName: adminName, agencyName: orgName, rejectionReason: reason,
  });
  await sendMail(email, subject, html);
};

exports.sendAnnouncementEmail = async (email, name, title, content, priority) => {
  const { html, subject } = await renderTemplate('announcement', {
    userName: name, title, content,
    announcementsUrl: `${process.env.FRONTEND_URL}/announcements`,
  });
  await sendMail(email, subject, html);
};