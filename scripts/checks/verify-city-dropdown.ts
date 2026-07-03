/**
 * Verify the Canadian city dropdown is clean: replicate the distinct=cities UNION
 * query, then show what the official-list filter keeps vs removes.
 *   npx tsx scripts/checks/verify-city-dropdown.ts
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const official: Record<string, string[]> = JSON.parse(fs.readFileSync('src/lib/canadian_cities.json', 'utf-8'));

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const officialSet = new Set<string>();
for (const arr of Object.values(official)) for (const n of arr) officialSet.add(key(n));

async function main() {
    try {
        const rows = await prisma.$queryRaw<{ city: string }[]>`
            SELECT DISTINCT name as city FROM (
                SELECT c."name" FROM "City" c JOIN "Parcel" p ON p."cityId" = c.id WHERE p.country ILIKE 'canada'
                UNION
                SELECT p."cityRaw" as name FROM "Parcel" p WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" <> '' AND p.country ILIKE 'canada'
            ) combined WHERE name IS NOT NULL AND name <> '' ORDER BY name`;

        const all = rows.map(r => r.city);
        const kept = all.filter(c => officialSet.has(key(c)));
        const removed = all.filter(c => !officialSet.has(key(c)));

        console.log(`Distinct Canadian city values in data: ${all.length}`);
        console.log(`  KEPT (official, shown in dropdown):   ${kept.length}`);
        console.log(`  REMOVED (junk, hidden from dropdown): ${removed.length}\n`);
        console.log('Sample REMOVED (these no longer appear in the dropdown):');
        console.log(removed.slice(0, 30).map(c => `  "${c}"`).join('\n'));
        console.log('\nAny weird KEPT values (digits / very long)? — should be only real municipalities:');
        console.log(kept.filter(c => /\d/.test(c) || c.length > 30).slice(0, 20).map(c => `  "${c}"`).join('\n') || '  (none)');
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
