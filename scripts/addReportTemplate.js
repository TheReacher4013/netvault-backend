require('dotenv').config();
const connectDB = require('../config/db');
const EmailTemplate = require('../models/EmailTemplate.model');

connectDB().then(async () => {
    await EmailTemplate.findOneAndUpdate(
        { templateId: 'report' },
        {
            $setOnInsert: {
                templateId: 'report',
                name: 'Daily Report',
                tag: 'Scheduled email',
                subject: 'Daily Report',
                headerTitle: 'NetVault',
                headerSub: 'Daily Report',
                greeting: '',
                body: '',
                highlight: '',
                btnText: '',
                btnUrl: '',
                footer: 'NetVault — Automated Daily Report · Data shown is for today (IST) only.',
                hdrColor: '#0D2B1F',
                hdrTxtColor: '#2ECC8A',
                hlColor: '#2ECC8A',
                hlBg: '#F0FBF5',
                btnColor: '#2ECC8A',
                btnTxtColor: '#050F0A',
                footerBg: '#F9FAFB',
                footerTxt: '#9CA3AF',
            }
        },
        { upsert: true, new: true }
    );
    console.log('Report template added!');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});