require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
    console.log('\n🔄 NetVault — subdomain migration\n' + '─'.repeat(50));
    await mongoose.connect(process.env.MONGO_URI);

    const Domain = require('../models/Domain.model');

    const parents = await Domain.find({
        subdomains: { $exists: true, $ne: [], $not: { $size: 0 } },
    });

    console.log(`Found ${parents.length} parent domain(s) with embedded subdomains\n`);

    let created = 0, skipped = 0, errors = 0;

    for (const parent of parents) {
        const sublist = parent.subdomains || [];
        for (const sub of sublist) {
    
            if (!sub.name) { skipped++; continue; }

            
            const fullName = sub.name.includes('.')
                ? sub.name.toLowerCase()
                : `${sub.name.toLowerCase()}.${parent.name}`;
            const existing = await Domain.findOne({ tenantId: parent.tenantId, name: fullName });
            if (existing) {
                console.log(`  ⏭  Skip: ${fullName} already exists as Domain`);
                skipped++;
                continue;
            }

            try {
                await Domain.create({
                    tenantId: parent.tenantId,
                    name: fullName,
                    parentDomainId: parent._id,
                    // Inherit from parent — these are editable later
                    expiryDate: parent.expiryDate,
                    registrar: parent.registrar,
                    clientId: parent.clientId,
                    status: parent.status,
                });
                console.log(`  ✓ Created: ${fullName} (parent: ${parent.name})`);
                created++;
            } catch (err) {
                console.error(`  ✗ Failed: ${fullName} — ${err.message}`);
                errors++;
            }
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(` Done.  Created: ${created}  Skipped: ${skipped}  Errors: ${errors}`);
    console.log(`\nNote: embedded 'subdomains' arrays on parent docs are left in place.`);
    console.log(`After verifying the migration, you can clear them manually in Mongo:`);
    console.log(`   db.domains.updateMany({}, { $unset: { subdomains: "" } })\n`);

    process.exit(0);
})().catch(err => {
    console.error('\n💥 Migration failed:', err.message);
    process.exit(1);
});