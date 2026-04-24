require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    console.log('\n🔄 NetVault — recalculating domain statuses\n' + '─'.repeat(55));

    await mongoose.connect(process.env.MONGO_URI);
    const Domain = require('../models/Domain.model');

    const domains = await Domain.find({});
    console.log(`Found ${domains.length} domain(s)\n`);

    const PROTECTED = ['transfer', 'suspended'];
    let updated = 0, skipped = 0, unchanged = 0;

    for (const d of domains) {
        if (PROTECTED.includes(d.status)) {
            console.log(`⏭  ${d.name.padEnd(35)} skip (status: ${d.status})`);
            skipped++;
            continue;
        }

        const now = new Date();
        const daysLeft = Math.ceil((d.expiryDate - now) / 86400000);
        const expectedStatus = daysLeft < 0 ? 'expired'
            : daysLeft <= 30 ? 'expiring'
                : 'active';

        const oldStatus = d.status;

        if (oldStatus === expectedStatus) {
            unchanged++;
            continue;
        }

        d.markModified('expiryDate');
        try {
            await d.save();
            console.log(`✓  ${d.name.padEnd(35)} ${oldStatus.padEnd(10)} → ${expectedStatus} (${daysLeft}d left)`);
            updated++;
        } catch (err) {
            console.error(`✗  ${d.name}: ${err.message}`);
        }
    }

    console.log(`\n${'─'.repeat(55)}`);
    console.log(`Updated:   ${updated}`);
    console.log(`Unchanged: ${unchanged}`);
    console.log(`Skipped:   ${skipped} (transfer/suspended — manual status)`);
    console.log('\n✅ Done.\n');
    process.exit(0);
})().catch(err => {
    console.error('\n💥 Script failed:', err.message);
    process.exit(1);
});