/**
 * scripts/seedEmailTemplates.js
 * Run once: node scripts/seedEmailTemplates.js
 * Seeds the DB with default email template configs.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const EmailTemplate = require('../models/EmailTemplate.model');

const DEFAULTS = [
    {
        templateId: 'welcome', name: 'Welcome', tag: 'On register',
        subject: 'Welcome to NetVault!',
        headerTitle: 'NetVault', headerSub: 'Domain & Hosting Management',
        greeting: 'Welcome, {{agencyName}}!',
        body: 'Your agency is now set up on NetVault. You can manage all your domains, hosting, clients, and billing from one place.',
        highlight: 'Your dashboard is ready. Start by adding your first domain or client.',
        btnText: 'Open Dashboard', btnUrl: '{{dashboardUrl}}',
        footer: 'NetVault — Domain & Hosting Management Platform',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#2ECC8A', hlBg: '#F0FBF5',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'reset', name: 'Password reset', tag: 'On request',
        subject: 'Reset your NetVault password',
        headerTitle: 'NetVault', headerSub: 'Password Reset',
        greeting: 'Hi {{userName}},',
        body: 'You requested a password reset for your NetVault account.',
        highlight: 'This reset link expires in 15 minutes. If you did not request this, ignore this email.',
        btnText: 'Reset Password', btnUrl: '{{resetUrl}}',
        footer: 'NetVault — Domain & Hosting Management Platform',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#2ECC8A', hlBg: '#F0FBF5',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'otp', name: 'OTP verify', tag: 'On registration',
        subject: 'Your NetVault verification code',
        headerTitle: 'NetVault', headerSub: 'Verify your email',
        greeting: 'Hi there,',
        body: 'Use the code below to verify your email and continue registration. This code expires in 10 minutes.',
        highlight: '{{otpCode}}',
        btnText: '', btnUrl: '',
        footer: 'NetVault — Email Verification',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#6366F1', hlBg: '#F0EEFF',
        btnColor: '#6366F1', btnTxtColor: '#fff', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'domain-urgent', name: 'Domain expiry — urgent', tag: '5 days left',
        subject: 'URGENT: {{domainName}} expires in {{daysLeft}} days',
        headerTitle: 'NetVault', headerSub: 'Domain Expiry Alert',
        greeting: 'Hi {{userName}},',
        body: 'Your domain is expiring very soon. Please renew it immediately to avoid downtime and loss of the domain.',
        highlight: '{{domainName}} expires in {{daysLeft}} days.',
        btnText: 'Manage Domain', btnUrl: '{{domainUrl}}',
        footer: 'NetVault — Automated Alert System',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#EF4444', hlBg: '#FEF2F2',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'domain-warn', name: 'Domain expiry — warning', tag: '15 days left',
        subject: 'Warning: {{domainName}} expires in {{daysLeft}} days',
        headerTitle: 'NetVault', headerSub: 'Domain Expiry Alert',
        greeting: 'Hi {{userName}},',
        body: 'Your domain is expiring soon. Please renew it to avoid any service disruption.',
        highlight: '{{domainName}} expires in {{daysLeft}} days.',
        btnText: 'Manage Domain', btnUrl: '{{domainUrl}}',
        footer: 'NetVault — Automated Alert System',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#F59E0B', hlBg: '#FFFBEB',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'hosting', name: 'Hosting expiry', tag: 'Expiry alert',
        subject: 'Hosting for {{domainName}} expiring soon',
        headerTitle: 'NetVault', headerSub: 'Hosting Expiry Alert',
        greeting: 'Hi {{userName}},',
        body: 'Your hosting plan is expiring soon. Please renew to avoid downtime.',
        highlight: '{{hostingPlan}} for {{domainName}} expires in {{daysLeft}} days.',
        btnText: 'Manage Hosting', btnUrl: '{{hostingUrl}}',
        footer: 'NetVault — Automated Alert System',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#F59E0B', hlBg: '#FFFBEB',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'ssl', name: 'SSL expiry', tag: 'Expiry alert',
        subject: 'SSL for {{domainName}} expiring in {{daysLeft}} days',
        headerTitle: 'NetVault', headerSub: 'SSL Certificate Alert',
        greeting: 'Hi {{userName}},',
        body: 'Your SSL certificate is expiring soon. Renew it to keep your site secure and trusted.',
        highlight: 'SSL for {{domainName}} expires in {{daysLeft}} days.',
        btnText: 'Manage SSL', btnUrl: '{{domainUrl}}',
        footer: 'NetVault — Automated Alert System',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#3B82F6', hlBg: '#EFF6FF',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'serverdown', name: 'Server down', tag: 'Uptime alert',
        subject: 'ALERT: {{serverName}} is DOWN',
        headerTitle: 'NetVault', headerSub: 'Server Down Alert',
        greeting: 'Hi {{userName}},',
        body: 'One of your monitored servers is currently unreachable. Please investigate immediately.',
        highlight: '{{serverName}} ({{serverIp}}) is DOWN.',
        btnText: 'View Uptime', btnUrl: '{{uptimeUrl}}',
        footer: 'NetVault — Automated Monitoring',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#EF4444', hlBg: '#FEF2F2',
        btnColor: '#EF4444', btnTxtColor: '#fff', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'invoice', name: 'Invoice', tag: 'On create',
        subject: 'Invoice {{invoiceNo}} — ₹{{amount}}',
        headerTitle: 'NetVault', headerSub: 'Invoice',
        greeting: 'Hi {{userName}},',
        body: 'Please find your invoice attached. You can also view it from the client portal.',
        highlight: 'Invoice {{invoiceNo}} · ₹{{amount}} due by {{dueDate}}.',
        btnText: 'View in Portal', btnUrl: '{{invoiceUrl}}',
        footer: 'NetVault — Billing System',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#2ECC8A', hlBg: '#F0FBF5',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'invite', name: 'Client invite', tag: 'On invite',
        subject: 'You have been invited to {{agencyName}} portal',
        headerTitle: 'NetVault', headerSub: 'Client Portal Invitation',
        greeting: 'Hi {{clientName}},',
        body: '{{agencyName}} has invited you to access your client portal on NetVault.',
        highlight: 'Click below to set your password and log in. This link is valid for 7 days.',
        btnText: 'Set Password & Log In', btnUrl: '{{inviteUrl}}',
        footer: 'NetVault — Client Portal',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#2ECC8A', hlBg: '#F0FBF5',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'portal-welcome', name: 'Portal welcome', tag: 'After set password',
        subject: 'Welcome to your {{agencyName}} client portal',
        headerTitle: 'NetVault', headerSub: 'Welcome to your client portal',
        greeting: 'Hi {{clientName}},',
        body: '{{agencyName}} has given you access to the NetVault client portal.',
        highlight: 'You can now log in to view your domains, hosting, invoices, and alerts.',
        btnText: 'Go to Login', btnUrl: '{{loginUrl}}',
        footer: 'NetVault — Client Portal',
        hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7', hlColor: '#2ECC8A', hlBg: '#F0FBF5',
        btnColor: '#2ECC8A', btnTxtColor: '#050F0A', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'plan-change', name: 'Plan changed', tag: 'On plan update',
        subject: 'Your NetVault plan has been updated',
        headerTitle: 'NetVault', headerSub: 'Plan Updated',
        greeting: 'Hi {{userName}},',
        body: 'Your NetVault subscription for {{agencyName}} has been updated.',
        highlight: '{{oldPlan}} → {{newPlan}}. New limits are active immediately.',
        btnText: 'View plan details', btnUrl: '{{plansUrl}}',
        footer: 'NetVault — Platform Notification',
        hdrColor: '#1e1b4b', hdrTxtColor: '#818CF8', hlColor: '#6366F1', hlBg: '#F0F0FF',
        btnColor: '#6366F1', btnTxtColor: '#fff', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'plan-activated', name: 'Plan activated', tag: 'On SA approve',
        subject: 'Your NetVault plan is now active!',
        headerTitle: 'NetVault', headerSub: 'Plan Activated',
        greeting: 'Welcome aboard, {{userName}}!',
        body: 'Your subscription for {{agencyName}} has been approved and your {{planName}} plan is now active.',
        highlight: 'Full dashboard access is enabled. Log in to start adding domains, hosting, and clients.',
        btnText: 'Go to Dashboard', btnUrl: '{{dashboardUrl}}',
        footer: 'NetVault — Plan Activation',
        hdrColor: '#065F46', hdrTxtColor: '#fff', hlColor: '#10B981', hlBg: '#E8F8F2',
        btnColor: '#10B981', btnTxtColor: '#fff', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'plan-rejected', name: 'Plan rejected', tag: 'On SA reject',
        subject: 'Your NetVault plan request could not be approved',
        headerTitle: 'NetVault', headerSub: 'Plan request update',
        greeting: 'Hi {{userName}},',
        body: 'We reviewed your plan request for {{agencyName}} and were unable to approve it at this time.',
        highlight: 'Reason: {{rejectionReason}}',
        btnText: '', btnUrl: '',
        footer: 'NetVault — Support',
        hdrColor: '#7f1d1d', hdrTxtColor: '#FCA5A5', hlColor: '#EF4444', hlBg: '#FFF0F0',
        btnColor: '#EF4444', btnTxtColor: '#fff', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
    {
        templateId: 'announcement', name: 'Announcement', tag: 'On publish',
        subject: '{{title}} — NetVault Announcement',
        headerTitle: 'NetVault', headerSub: 'Announcement',
        greeting: 'Hi {{userName}},',
        body: 'We have a new announcement from the NetVault team.',
        highlight: '{{content}}',
        btnText: 'View All Announcements', btnUrl: '{{announcementsUrl}}',
        footer: 'NetVault — Platform Announcement',
        hdrColor: '#1e1b4b', hdrTxtColor: '#818CF8', hlColor: '#6366F1', hlBg: '#EFF0FF',
        btnColor: '#6366F1', btnTxtColor: '#fff', footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
    },
];

async function seed() {
    await connectDB();
    for (const t of DEFAULTS) {
        await EmailTemplate.findOneAndUpdate(
            { templateId: t.templateId },
            { $setOnInsert: t },
            { upsert: true, new: true }
        );
        console.log(`✓ ${t.templateId}`);
    }
    console.log('✅ Email templates seeded!');
    process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });