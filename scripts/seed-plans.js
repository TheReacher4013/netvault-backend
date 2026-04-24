require('dotenv').config();
const mongoose = require('mongoose');

const DEFAULT_PLANS = [
    {
        name: 'free',
        displayName: 'Free',
        price: 0,
        billingCycle: 'monthly',
        maxDomains: 10,
        maxClients: 5,
        maxHosting: 5,
        maxStaff: 1,
        features: [
            '10 domains',
            '5 clients',
            '5 hosting plans',
            'Email alerts',
            'Basic reports',
        ],
        isActive: true,
        isPopular: false,
        trialDays: 0,
    },
    {
        name: 'pro',
        displayName: 'Pro',
        price: 999,
        billingCycle: 'monthly',
        maxDomains: 100,
        maxClients: 50,
        maxHosting: 50,
        maxStaff: 5,
        features: [
            '100 domains',
            '50 clients',
            '50 hosting plans',
            'Email + SMS alerts',
            'Uptime monitoring',
            'PDF invoices',
            'Client portal',
            'Activity log',
        ],
        isActive: true,
        isPopular: true,
        trialDays: 14,
    },
    {
        name: 'agency',
        displayName: 'Agency',
        price: 2999,
        billingCycle: 'monthly',
        maxDomains: 99999,
        maxClients: 99999,
        maxHosting: 99999,
        maxStaff: 99999,
        features: [
            'Unlimited domains',
            'Unlimited clients',
            'Unlimited hosting',
            'Unlimited staff',
            'All Pro features',
            '2FA security',
            'Priority support',
            'Custom branding',
        ],
        isActive: true,
        isPopular: false,
        trialDays: 14,
    },
];

(async () => {
    console.log('\n🌱 Seeding default plans...\n');
    await mongoose.connect(process.env.MONGO_URI);

    const { Plan } = require('../models/index');

    for (const p of DEFAULT_PLANS) {
        const result = await Plan.findOneAndUpdate(
            { name: p.name },
            p,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`  ✓ ${result.displayName.padEnd(10)} ₹${String(result.price).padStart(5)} — ${result._id}`);
    }

    const total = await Plan.countDocuments();
    console.log(`\n✅ Done. ${total} plan(s) in database.\n`);
    process.exit(0);
})().catch(err => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
});