/**
 * scripts/updateEmailTemplates.js
 * Run once: node scripts/updateEmailTemplates.js
 *
 * Force-updates existing email templates in DB for:
 *   1. portal-welcome  — now includes {{clientEmail}} and {{clientPassword}}
 *   2. user-created    — new template for User Management (staff/admin accounts)
 */
require('dotenv').config();
const connectDB = require('../config/db');
const EmailTemplate = require('../models/EmailTemplate.model');

const UPDATES = [
    {
        templateId: 'portal-welcome',
        update: {
            name: 'Portal welcome',
            tag: 'After set password',
            subject: 'Welcome to your {{agencyName}} client portal',
            headerTitle: 'NetVault',
            headerSub: 'Welcome to your client portal',
            greeting: 'Hi {{clientName}},',
            body: '{{agencyName}} has given you access to the NetVault client portal. Your login credentials are below — please keep them safe.',
            highlight: '📧 Email: {{clientEmail}}\n🔑 Password: {{clientPassword}}',
            btnText: 'Go to Login',
            btnUrl: '{{loginUrl}}',
            footer: 'NetVault — Client Portal',
            hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7',
            hlColor: '#2ECC8A', hlBg: '#F0FBF5',
            btnColor: '#2ECC8A', btnTxtColor: '#050F0A',
            footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
        },
    },
    {
        templateId: 'user-created',
        update: {
            name: 'User created by admin',
            tag: 'On user add',
            subject: 'Your {{agencyName}} account has been created',
            headerTitle: 'NetVault',
            headerSub: 'Account Created',
            greeting: 'Hi {{userName}},',
            body: 'An account has been created for you on the {{agencyName}} NetVault dashboard. Use the credentials below to log in.',
            highlight: '📧 Email: {{userEmail}}\n🔑 Password: {{userPassword}}',
            btnText: 'Go to Dashboard',
            btnUrl: '{{dashboardUrl}}',
            footer: 'NetVault — Team Access',
            hdrColor: '#0D2B1F', hdrTxtColor: '#6EE7B7',
            hlColor: '#2ECC8A', hlBg: '#F0FBF5',
            btnColor: '#2ECC8A', btnTxtColor: '#050F0A',
            footerBg: '#F9FAFB', footerTxt: '#9CA3AF',
        },
    },
];

async function run() {
    await connectDB();
    for (const { templateId, update } of UPDATES) {
        const result = await EmailTemplate.findOneAndUpdate(
            { templateId },
            { $set: update },
            { upsert: true, new: true }
        );
        console.log(`✓ ${templateId} — ${result ? 'updated/created' : 'failed'}`);
    }
    console.log('✅ Email templates updated!');
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });