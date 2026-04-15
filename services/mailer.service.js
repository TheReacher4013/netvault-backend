const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const createTransporter = () => nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

const sendMail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'NetVault <noreply@netvault.app>',
      to, subject, html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email failed to ${to}: ${err.message}`);
  }
};

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;}
  .card{background:#fff;max-width:580px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);}
  .header{background:linear-gradient(135deg,#0D2B1F,#1C4A34);padding:28px 32px;}
  .header h1{color:#2ECC8A;margin:0;font-size:22px;}
  .header p{color:#A8C4B8;margin:4px 0 0;font-size:13px;}
  .body{padding:28px 32px;color:#333;}
  .highlight{background:#F0FBF5;border-left:4px solid #2ECC8A;padding:14px 18px;border-radius:6px;margin:16px 0;}
  .btn{display:inline-block;background:#2ECC8A;color:#050F0A!important;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;}
  .footer{padding:18px 32px;background:#F9FAFB;border-top:1px solid #E8F0EC;font-size:12px;color:#888;text-align:center;}
</style>
</head>
<body><div class="card">${content}</div></body>
</html>`;

exports.sendWelcomeEmail = async (email, name, orgName) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Domain & Hosting Management</p></div>
    <div class="body">
      <h2>Welcome, ${name}! 🎉</h2>
      <p>Your agency <strong>${orgName}</strong> is now set up on NetVault.</p>
      <div class="highlight">You can now manage all your domains, hosting plans, clients, and billing from one dashboard.</div>
      <a class="btn" href="${process.env.FRONTEND_URL}/dashboard">Open Dashboard</a>
    </div>
    <div class="footer">NetVault — Domain & Hosting Management Platform</div>
  `);
  await sendMail(email, `Welcome to NetVault, ${name}!`, html);
};

exports.sendPasswordResetEmail = async (email, name, resetUrl) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Password Reset</p></div>
    <div class="body">
      <h2>Reset Your Password</h2>
      <p>Hi ${name}, you requested a password reset.</p>
      <div class="highlight">This link expires in <strong>15 minutes</strong>.</div>
      <a class="btn" href="${resetUrl}">Reset Password</a>
      <p style="margin-top:20px;font-size:13px;color:#888;">If you didn't request this, ignore this email.</p>
    </div>
    <div class="footer">NetVault — Domain & Hosting Management Platform</div>
  `);
  await sendMail(email, 'NetVault — Reset Your Password', html);
};

exports.sendDomainExpiryAlert = async (email, name, domain, daysLeft) => {
  const urgency = daysLeft <= 7 ? '🔴 URGENT' : daysLeft <= 15 ? '🟠 Warning' : '🟡 Reminder';
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Domain Expiry Alert</p></div>
    <div class="body">
      <h2>${urgency}: Domain Expiring Soon</h2>
      <p>Hi ${name},</p>
      <div class="highlight">
        <strong>${domain}</strong> expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.<br/>
        Please renew it to avoid downtime.
      </div>
      <a class="btn" href="${process.env.FRONTEND_URL}/domains">Manage Domain</a>
    </div>
    <div class="footer">NetVault — Automated Alert System</div>
  `);
  await sendMail(email, `${urgency}: ${domain} expires in ${daysLeft} days`, html);
};

exports.sendHostingExpiryAlert = async (email, name, hosting, daysLeft) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Hosting Expiry Alert</p></div>
    <div class="body">
      <h2>⚡ Hosting Plan Expiring</h2>
      <p>Hi ${name},</p>
      <div class="highlight">
        Hosting plan <strong>${hosting}</strong> expires in <strong>${daysLeft} days</strong>.
      </div>
      <a class="btn" href="${process.env.FRONTEND_URL}/hosting">Manage Hosting</a>
    </div>
    <div class="footer">NetVault — Automated Alert System</div>
  `);
  await sendMail(email, `Hosting Expiry: ${hosting} — ${daysLeft} days left`, html);
};

exports.sendSSLExpiryAlert = async (email, name, domain, daysLeft) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>SSL Certificate Alert</p></div>
    <div class="body">
      <h2>🔒 SSL Certificate Expiring</h2>
      <div class="highlight">SSL for <strong>${domain}</strong> expires in <strong>${daysLeft} days</strong>.</div>
      <a class="btn" href="${process.env.FRONTEND_URL}/hosting">Manage SSL</a>
    </div>
    <div class="footer">NetVault — Automated Alert System</div>
  `);
  await sendMail(email, `SSL Expiry: ${domain} — ${daysLeft} days left`, html);
};

exports.sendServerDownAlert = async (email, name, server) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Server Down Alert</p></div>
    <div class="body">
      <h2>🔴 Server Unreachable</h2>
      <div class="highlight" style="border-left-color:#E05757;background:#FFF5F5;">
        <strong>${server}</strong> is currently <strong style="color:#E05757">DOWN</strong>. Please investigate immediately.
      </div>
      <a class="btn" style="background:#E05757;" href="${process.env.FRONTEND_URL}/uptime">View Uptime</a>
    </div>
    <div class="footer">NetVault — Automated Monitoring</div>
  `);
  await sendMail(email, `🔴 Server Down: ${server}`, html);
};

exports.sendInvoiceEmail = async (email, name, invoiceNo, total, dueDate) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Invoice</p></div>
    <div class="body">
      <h2>Invoice ${invoiceNo}</h2>
      <p>Hi ${name}, a new invoice has been generated for you.</p>
      <div class="highlight">
        Amount: <strong>₹${total}</strong><br/>
        Due Date: <strong>${new Date(dueDate).toDateString()}</strong>
      </div>
      <a class="btn" href="${process.env.FRONTEND_URL}/billing">View Invoice</a>
    </div>
    <div class="footer">NetVault — Billing System</div>
  `);
  await sendMail(email, `Invoice ${invoiceNo} — ₹${total}`, html);
};
