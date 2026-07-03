/**
 * Verify the Canadian county dropdown: replicate the distinct=filters county UNION,
 * then show what the official Census-Division filter keeps vs removes.
 *   npx tsx scripts/checks/verify-county-dropdown.ts
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { normalizeCountyName } from '../../src/lib/extract-location';

const prisma = new PrismaClient();
const official: Record<string, string[]> = JSON.parse(fs.readFileSync('src/lib/canadian_counties.json', 'utf-8'));
const set = new Set<string>();
for (const arr of Object.values(official)) for (const n of arr) set.add(normalizeCountyName(n));

async function main() {
    try {
        const total = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint n FROM "Parcel" WHERE country ILIKE 'canada' AND "countyId" IS NOT NULL`;
        const rows = await prisma.$queryRaw<{ county: string }[]>`
            SELECT DISTINCT name as county FROM (
                SELECT c."name" FROM "County" c JOIN "Parcel" p ON p."countyId" = c.id WHERE p.country ILIKE 'canada'
                UNION
                SELECT p."county" as name FROM "Parcel" p WHERE p."county" IS NOT NULL AND p."county" <> '' AND p.country ILIKE 'canada'
            ) combined WHERE name IS NOT NULL AND name <> '' ORDER BY name`;

        const all = rows.map(r => r.county);
        const kept = all.filter(c => set.has(normalizeCountyName(c)));
        const removed = all.filter(c => !set.has(normalizeCountyName(c)));

        console.log(`CA parcels with a county set: ${total[0].n}`);
        console.log(`Distinct county values in data: ${all.length}  (kept ${kept.length}, removed ${removed.length})\n`);
        console.log('Kept (shown in dropdown) — sample:');
        console.log(kept.slice(0, 30).map(c => `  ${c}`).join('\n'));
        if (removed.length) {
            console.log('\nRemoved (hidden) — sample:');
            console.log(removed.slice(0, 20).map(c => `  "${c}"`).join('\n'));
        }
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
