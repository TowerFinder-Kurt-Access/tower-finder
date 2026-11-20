// Fills Tower.businessName from the parcel address for USA towers that have no
// name at all. The sheet's Sitename column is blank on these rows, so the street
// address is the only identifier left and an empty name column helps nobody.
//
// Usage:
//   node scripts/backfill-us-names.js            # preview
//   node scripts/backfill-us-names.js --write    # persist
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');

/** The street part of an address: everything before the first comma. */
const streetOf = (address) => String(address ?? '').split(',')[0].trim() || null;

(async () => {
    const rows = await prisma.$queryRaw`
        SELECT t.id, p.address
        FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA' AND t."businessName" IS NULL AND p.address IS NOT NULL
        ORDER BY t.id
    `;
    console.log(`nameless USA towers with an address: ${rows.length}`);

    let filled = 0;
    for (const row of rows) {
        const name = streetOf(row.address);
        if (!name) continue;
        filled += 1;
        console.log(`  ${row.id}: ${name}`);
        if (WRITE) {
            await prisma.$executeRaw`UPDATE "Tower" SET "businessName" = ${name} WHERE id = ${row.id}`;
        }
    }

    console.log(`\nfilled: ${filled}`);
    if (!WRITE) console.log('Dry run. Re-run with --write to persist.');
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
