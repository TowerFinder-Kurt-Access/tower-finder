/** Undoes promote-us-leads.ts. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROMOTED_SOURCE = 'OpenStreetMap (promoted lead)';

async function main() {
    const write = process.argv.includes('--write');

    const towers = await prisma.tower.findMany({
        where: { source: PROMOTED_SOURCE },
        select: { id: true, lat: true, lon: true, rawImportData: true },
    });
    console.log(`towers created by the promotion: ${towers.length}`);
    if (!towers.length) {
        console.log('nothing to revert');
        return;
    }

    const before = await prisma.tower.count();
    const ids = towers.map(t => t.id);

    // Only release leads that point at one of these towers.
    const leads = await prisma.towerLead.findMany({
        where: { promotedToTowerId: { in: ids } },
        select: { id: true, promotedToTowerId: true },
    });
    console.log(`leads to release: ${leads.length}`);

    const withTags = towers.filter(t => t.rawImportData !== null && t.rawImportData !== undefined).length;
    console.log(`rows carrying OSM tags that would be discarded: ${withTags}`);

    if (!write) {
        console.log(`\ntower table would return to ${before - towers.length} records (from ${before})`);
        console.log('dry run. add --write to apply.');
        console.log('  npx tsx --env-file=.env scripts/revert-us-osm-promotion.ts --write');
        return;
    }

    const CHUNK = 1000;
    let deleted = 0;
    for (let i = 0; i < towers.length; i += CHUNK) {
        const chunk = towers.slice(i, i + CHUNK);
        const res = await prisma.tower.deleteMany({ where: { id: { in: chunk.map(t => t.id) } } });
        deleted += res.count;
        console.log(`  deleted ${deleted}/${towers.length}`);
    }

    await prisma.towerLead.updateMany({
        where: { promotedToTowerId: { in: ids } },
        data: { promotedToTowerId: null, promotedAt: null },
    });

    const after = await prisma.tower.count();
    console.log(`\ndeleted ${deleted} towers`);
    console.log(`tower table now holds ${after} records (was ${before})`);
    console.log('next: npx tsx --env-file=.env scripts/score-towers.ts');
    console.log('the daily score_towers job will refresh any rows left stale by the delete');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());