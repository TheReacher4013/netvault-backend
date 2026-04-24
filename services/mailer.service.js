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

const sendMail = async (to, subject, html) => {
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

exports.sendInvoiceEmail = async (email, name, invoiceNo, total, dueDate, pdfPath = null) => {
  const fmtTotal = Number(total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtDate = new Date(dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Invoice</p></div>
    <div class="body">
      <h2>Invoice ${invoiceNo}</h2>
      <p>Hi ${name},</p>
      <p>Please find your invoice attached to this email. You can also view and download it from the client portal.</p>
      <div class="highlight">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;">Invoice No</td><td style="padding:4px 0;font-weight:700;text-align:right;">${invoiceNo}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Amount Due</td><td style="padding:4px 0;font-weight:700;font-size:18px;text-align:right;color:#0F6E56;">₹${fmtTotal}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Due Date</td><td style="padding:4px 0;font-weight:700;text-align:right;">${fmtDate}</td></tr>
        </table>
      </div>
      <p style="font-size:13px;color:#888;margin-top:16px;">The invoice PDF is attached to this email for your records.</p>
      <a class="btn" href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/billing">View in Portal</a>
    </div>
    <div class="footer">NetVault — Billing System | This is an auto-generated email.</div>
  `);

  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: process.env.MAIL_FROM || 'NetVault <noreply@netvault.app>',
      to: email,
      subject: `Invoice ${invoiceNo} — ₹${fmtTotal} | NetVault`,
      html,
    };

    
    if (pdfPath) {
      const fs = require('fs');
      if (fs.existsSync(pdfPath)) {
        mailOptions.attachments = [
          {
            filename: `${invoiceNo}.pdf`,
            path: pdfPath,
            contentType: 'application/pdf',
          },
        ];
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
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Client Portal Invitation</p></div>
    <div class="body">
      <h2>Hi ${clientName},</h2>
      <p><strong>${agencyName}</strong> has invited you to access your client portal on NetVault.</p>
      <div class="highlight">
        Click the button below to set your password and log in. This link is valid for <strong>7 days</strong>.
      </div>
      <a class="btn" href="${inviteUrl}">Set Password & Log In</a>
      <p style="margin-top:20px;font-size:13px;color:#888;">
        Through the portal, you'll be able to view your domains, hosting, invoices, and alerts in one place.
      </p>
      <p style="margin-top:16px;font-size:12px;color:#aaa;">
        If you weren't expecting this email, you can safely ignore it.
      </p>
    </div>
    <div class="footer">NetVault — Client Portal</div>
  `);
  await sendMail(email, `${agencyName} invited you to the client portal`, html);
};


exports.sendClientPortalWelcome = async (email, clientName, agencyName) => {
  const html = baseTemplate(`
    <div class="header"><h1>🌐 NetVault</h1><p>Welcome to your Client Portal</p></div>
    <div class="body">
      <h2>Hi ${clientName},</h2>
      <p><strong>${agencyName || 'Your agency'}</strong> has given you access to the NetVault client portal.</p>
      <div class="highlight">
        You can now log in with your email and the password that was shared with you.
      </div>
      <a class="btn" href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Go to Login</a>
      <p style="margin-top:20px;font-size:13px;color:#888;">
        In the portal you can view your domains, hosting, invoices, and receive renewal alerts.
      </p>
    </div>
    <div class="footer">NetVault — Client Portal</div>
  `);
  await sendMail(email, 'Welcome to your NetVault client portal', html);
};



exports.sendOtpEmail = async (email, code, expiryMinutes) => {
  const html = baseTemplate(`
    <div class="header"><h1>🔐 NetVault</h1><p>Verify your email</p></div>
    <div class="body">
      <h2>Your verification code</h2>
      <p>Use the code below to verify your email and continue registration:</p>

      <div style="background:#F5F5F0;border:2px dashed #6366F1;border-radius:12px;
                  padding:24px;text-align:center;margin:24px 0;">
        <div style="font-family:'Courier New',monospace;font-size:36px;
                    font-weight:900;letter-spacing:12px;color:#6366F1;">
          ${code}
        </div>
      </div>

      <p style="font-size:13px;color:#666;">
        This code expires in <strong>${expiryMinutes} minutes</strong>.
        Don't share it with anyone — NetVault will never ask for it.
      </p>
      <p style="font-size:12px;color:#aaa;margin-top:20px;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">NetVault — Email Verification</div>
  `);
  await sendMail(email, `NetVault verification code: ${code}`, html);
};

exports.sendPlanChangeEmail = async (email, adminName, orgName, oldPlan, newPlan) => {
  const html = baseTemplate(`
    <div class="header"><h1>🎉 NetVault</h1><p>Plan Updated</p></div>
    <div class="body">
      <h2>Hi ${adminName || 'there'},</h2>
      <p>Your NetVault subscription for <strong>${orgName}</strong> has been updated.</p>
      <div class="highlight" style="font-size:15px;">
        <strong>${oldPlan}</strong> &nbsp;→&nbsp; <strong style="color:#6366F1;">${newPlan}</strong>
      </div>
      <p style="margin-top:20px;">Your new limits and features are active immediately.</p>
      <a class="btn" href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/company">View plan details</a>
      <p style="margin-top:20px;font-size:13px;color:#888;">
        If you didn't expect this change, please contact support immediately.
      </p>
    </div>
    <div class="footer">NetVault — Platform Notification</div>
  `);
  await sendMail(email, `Your NetVault plan is now ${newPlan}`, html);
};


exports.sendPlanActivatedEmail = async (email, adminName, orgName, planName) => {
  const html = baseTemplate(`
    <div class="header" style="background:#10B981;">
      <h1>✅ NetVault</h1>
      <p>Your plan is activated</p>
    </div>
    <div class="body">
      <h2>Welcome aboard, ${adminName || 'there'}!</h2>
      <p>Great news — your subscription for <strong>${orgName}</strong> has been
         approved and your <strong>${planName}</strong> plan is now active.</p>
 
      <div style="background:#E8F8F2;border-left:4px solid #10B981;
                  padding:16px 20px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-size:15px;color:#065f46;font-weight:600;">
          🎉 Full dashboard access is now enabled
        </p>
        <p style="margin:8px 0 0 0;font-size:13px;color:#047857;">
          Log in to start adding domains, hosting, clients, and invoices.
        </p>
      </div>
 
      <a class="btn" href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard">
        Go to Dashboard
      </a>
 
      <p style="margin-top:20px;font-size:13px;color:#666;">
        Need help getting started? Reply to this email and our team will guide you.
      </p>
    </div>
    <div class="footer">NetVault — Plan Activation</div>
  `);
  await sendMail(email, `🎉 Your ${planName} plan is now active`, html);
};


exports.sendPlanRejectedEmail = async (email, adminName, orgName, reason) => {
  const html = baseTemplate(`
    <div class="header" style="background:#C94040;">
      <h1>NetVault</h1>
      <p>Plan request update</p>
    </div>
    <div class="body">
      <h2>Hi ${adminName || 'there'},</h2>
      <p>We reviewed your plan request for <strong>${orgName}</strong> and
         unfortunately we were unable to approve it at this time.</p>
 
      <div style="background:#FFF0F0;border-left:4px solid #C94040;
                  padding:16px 20px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-size:13px;color:#666;font-weight:600;">Reason</p>
        <p style="margin:8px 0 0 0;font-size:14px;color:#7f1d1d;">
          ${reason}
        </p>
      </div>
 
      <p style="font-size:13px;color:#666;">
        If you'd like to discuss this or provide additional information, please
        reply to this email and our team will respond within one business day.
      </p>
 
      <p style="font-size:13px;color:#666;margin-top:20px;">
        You can still access your account, but dashboard features remain
        restricted until a plan is activated.
      </p>
    </div>
    <div class="footer">NetVault — Support</div>
  `);
  await sendMail(email, `Update on your NetVault plan request`, html);
};
