// Reverts one Brett call sheet batch. Dry run by default.
//
// Usage:
//   node scripts/revert-brett-call-sheet.js            # dry run, shows the plan
//   node scripts/revert-brett-call-sheet.js --write    # delete the batch
//
// Scope is the _batch tag in rawImportData, so nothing outside the batch is
// touched. Parcels, phones and notes cascade from Tower. An owner row is only
// deleted when no other parcel references it. A carrier created by the import
// is deleted only when no tower outside the batch references it.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const BATCH = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'brett-call-sheet-20260305';
const WRITE = process.argv.includes('--write');
const prisma = new PrismaClient();

(async () => {
    const towers = await prisma.tower.findMany({
        where: { rawImportData: { path: ['_batch'], equals: BATCH } },
        select: { id: true, carrierId: true, parcel: { select: { ownerId: true, parcelId: true, stateRaw: true } } },
    });

    if (towers.length === 0) {
        console.log(`No towers carry _batch = ${BATCH}. Nothing to revert.`);
        return;
    }

    const towerIds = towers.map((tower) => tower.id);
    const ownerIds = [...new Set(towers.map((tower) => tower.parcel?.ownerId).filter(Boolean))];
    const carrierIds = [...new Set(towers.map((tower) => tower.carrierId).filter(Boolean))];

    const [phones, notes, ownerUsage, carrierUsage] = await Promise.all([
        prisma.phone.count({ where: { towerId: { in: towerIds } } }),
        prisma.note.count({ where: { towerId: { in: towerIds } } }),
        prisma.parcel.groupBy({
            by: ['ownerId'],
            where: { ownerId: { in: ownerIds } },
            _count: { _all: true },
        }),
        prisma.tower.groupBy({
            by: ['carrierId'],
            where: { carrierId: { in: carrierIds } },
            _count: { _all: true },
        }),
    ]);

    const ownerUseById = new Map(ownerUsage.map((row) => [row.ownerId, row._count._all]));
    const carrierUseById = new Map(carrierUsage.map((row) => [row.carrierId, row._count._all]));
    const deletableOwners = ownerIds.filter((id) => (ownerUseById.get(id) ?? 0) === towers.filter((tower) => tower.parcel?.ownerId === id).length);
    const deletableCarriers = carrierIds.filter((id) => (carrierUseById.get(id) ?? 0) === towers.filter((tower) => tower.carrierId === id).length);

    const byState = towers.reduce((counts, tower) => {
        const state = tower.parcel?.stateRaw ?? '??';
        counts[state] = (counts[state] ?? 0) + 1;
        return counts;
    }, {});

    console.log(`--- Revert ${BATCH}: ${WRITE ? 'WRITE' : 'DRY RUN'} ---`);
    console.log(`Towers: ${towers.length}`);
    console.log('By state:', Object.entries(byState).sort().map(([state, count]) => `${state}:${count}`).join(' '));
    console.log(`Parcels (cascade): ${towers.filter((tower) => tower.parcel).length}`);
    console.log(`Phones (cascade): ${phones}`);
    console.log(`Notes (cascade): ${notes}`);
    console.log(`Owners to delete: ${deletableOwners.length} of ${ownerIds.length} (others are shared, kept)`);
    console.log(`Carriers to delete: ${deletableCarriers.length} of ${carrierIds.length} (others are shared, kept)`);
    for (const id of carrierIds) {
        const name = await prisma.carrier.findUnique({ where: { id }, select: { name: true } });
        const status = deletableCarriers.includes(id) ? 'delete' : 'keep';
        console.log(`  carrier ${id} ${name?.name ?? '(unknown)'}: ${status}`);
    }

    if (!WRITE) {
        console.log('\nDry run only. Add --write to delete the batch.');
        return;
    }

    await prisma.$transaction(async (tx) => {
        await tx.tower.deleteMany({ where: { id: { in: towerIds } } });
        if (deletableOwners.length > 0) {
            await tx.owner.deleteMany({ where: { id: { in: deletableOwners } } });
        }
        if (deletableCarriers.length > 0) {
            await tx.carrier.deleteMany({ where: { id: { in: deletableCarriers } } });
        }
    }, { timeout: 30000, maxWait: 15000 });

    const remaining = await prisma.tower.count({ where: { rawImportData: { path: ['_batch'], equals: BATCH } } });
    console.log(`\nDeleted ${towers.length} towers. Remaining with this batch tag: ${remaining}`);
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
