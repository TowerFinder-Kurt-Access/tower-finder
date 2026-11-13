// Verifies the Brett call sheet batch after a --write run.
// Usage: node scripts/verify-brett-call-sheet.js
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const BATCH = 'brett-call-sheet-20260305';
const prisma = new PrismaClient();

(async () => {
    const towers = await prisma.tower.findMany({
        where: { rawImportData: { path: ['_batch'], equals: BATCH } },
        include: { parcel: { include: { owner: true } }, phones: true, notes: true, type: true, status: true, carrier: true },
    });

    const totals = await prisma.$queryRaw`
        SELECT
            count(*)::int AS towers,
            count(*) FILTER (WHERE pa.country = 'USA')::int AS usa_parcels,
            (SELECT count(*)::int FROM "Phone" ph WHERE ph."towerId" IN (SELECT id FROM "Tower" WHERE "rawExcelData"->>'_batch' = ${BATCH})) AS phones,
            (SELECT count(*)::int FROM "Note" n WHERE n."towerId" IN (SELECT id FROM "Tower" WHERE "rawExcelData"->>'_batch' = ${BATCH})) AS notes
        FROM "Tower" t LEFT JOIN "Parcel" pa ON pa."towerId" = t.id
        WHERE t."rawExcelData"->>'_batch' = ${BATCH}`;

    const orphans = towers.filter((tower) => !tower.parcel);
    const badCoords = towers.filter((tower) => tower.lat < 24 || tower.lat > 50 || tower.lon < -126 || tower.lon > -66);
    const badState = towers.filter((tower) => !/^[A-Z]{2}$/.test(tower.parcel?.stateRaw ?? ''));
    const badPhones = towers.flatMap((tower) => tower.phones.map((phone) => ({ tower, phone })))
        .filter(({ phone }) => !/^[2-9]\d{2}[2-9]\d{6}$/.test(phone.number));
    const noType = towers.filter((tower) => !tower.typeId);
    const noStatus = towers.filter((tower) => !tower.statusId);

    console.log(`--- Batch ${BATCH} ---`);
    console.log(`Towers: ${totals[0].towers}`);
    console.log(`USA parcels: ${totals[0].usa_parcels}`);
    console.log(`Phones: ${totals[0].phones}`);
    console.log(`Notes: ${totals[0].notes}`);
    console.log(`Towers without parcel: ${orphans.length}`);
    console.log(`Towers with out-of-bbox coords: ${badCoords.length}`);
    console.log(`Towers with invalid state: ${badState.length}`);
    console.log(`Invalid phone numbers: ${badPhones.length}`);
    console.log(`Towers without type: ${noType.length}`);
    console.log(`Towers without status: ${noStatus.length}`);
    console.log(`Unique owners: ${new Set(towers.map((tower) => tower.parcel?.ownerId)).size}`);

    const byState = towers.reduce((counts, tower) => {
        const state = tower.parcel?.stateRaw ?? '??';
        counts[state] = (counts[state] ?? 0) + 1;
        return counts;
    }, {});
    console.log('By state:', Object.entries(byState).sort().map(([state, count]) => `${state}:${count}`).join(' '));

    const carriers = towers.reduce((counts, tower) => {
        const name = tower.carrier?.name ?? '(none)';
        counts[name] = (counts[name] ?? 0) + 1;
        return counts;
    }, {});
    console.log('By tower owner:', Object.entries(carriers).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}:${count}`).join(' '));

    const incomplete = towers.filter((tower) => !tower.businessName || !tower.parcel?.parcelId);
    console.log(`Incomplete rows (no sitename or no parcel id): ${incomplete.length}`);
    for (const tower of incomplete.slice(0, 10)) {
        console.log(`  tower ${tower.id} ${tower.rawImportData['Tower #']} sitename=${tower.businessName ?? 'null'} parcelId=${tower.parcel?.parcelId ?? 'null'}`);
    }
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
