/**
 * Read-only: diagnose the "weird city names" problem for Canadian parcels.
 *   npx tsx scripts/checks/inspect-cities.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const totalCA = await prisma.parcel.count({ where: { country: { equals: 'Canada', mode: 'insensitive' } } });
        const withCityId = await prisma.parcel.count({
            where: { country: { equals: 'Canada', mode: 'insensitive' }, cityId: { not: null } },
        });
        const withCityRaw = await prisma.parcel.count({
            where: {
                country: { equals: 'Canada', mode: 'insensitive' },
                AND: [{ cityRaw: { not: null } }, { cityRaw: { not: '' } }],
            },
        });
        console.log(`Canadian parcels: ${totalCA}`);
        console.log(`  linked to City table (cityId set): ${withCityId}`);
        console.log(`  have a raw cityRaw value:          ${withCityRaw}`);

        // City reference table sample (these feed the dropdown too)
        const cities = await prisma.city.findMany({
            include: { province: true, _count: { select: { parcels: true } } },
            orderBy: { name: 'asc' },
        });
        console.log(`\nCity table rows: ${cities.length}`);
        const weirdCity = cities.filter((c) => /\d/.test(c.name) || c.name.length > 30 || /[,#]/.test(c.name));
        console.log(`  City rows that look weird (digits / very long / punctuation): ${weirdCity.length}`);
        weirdCity.slice(0, 40).forEach((c) => console.log(`    "${c.name}" [${c.province?.code}] (${c._count.parcels} parcels)`));

        // Raw cityRaw values that look weird
        const rawRows = await prisma.$queryRaw<{ city: string; n: bigint }[]>`
            SELECT "cityRaw" as city, COUNT(*)::bigint as n
            FROM "Parcel"
            WHERE country ILIKE 'canada' AND "cityRaw" IS NOT NULL AND "cityRaw" <> ''
            GROUP BY "cityRaw"
            ORDER BY n DESC
        `;
        console.log(`\nDistinct cityRaw values (Canada): ${rawRows.length}`);
        const weirdRaw = rawRows.filter((r) => /\d/.test(r.city) || r.city.length > 30 || /[,#]/.test(r.city) || r.city.trim().split(/\s+/).length > 4);
        console.log(`  cityRaw values that look weird: ${weirdRaw.length}`);
        weirdRaw.slice(0, 50).forEach((r) => console.log(`    "${r.city}" (${r.n})`));
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
