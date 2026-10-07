// Score unreviewed towers (no human label, statusId null or "New") with the model in src/lib/ml/model.json.
import { PrismaClient } from '@prisma/client';
import {
    loadTowerModel, scoreTowers, staleTowerWhere,
    allBusinessAggregates, TOWER_SELECT, isScorable,
} from '../src/lib/ml/score';

const prisma = new PrismaClient();

const CHUNK = 5000;

async function main() {
    const model = loadTowerModel();
    console.log(`model ${model.version} (held-out AUC ${model.metrics.auc.toFixed(3)}), threshold ${model.threshold.toFixed(3)}`);

    const towers = await prisma.tower.findMany({ select: TOWER_SELECT });
    const business = await allBusinessAggregates(prisma);
    console.log(`towers: ${towers.length}, business aggregates: ${business.length}`);

    const targets = towers.filter(isScorable);
    console.log(`scoring ${targets.length} unreviewed towers, skipping ${towers.length - targets.length}...`);

    let written = 0;
    const inputs = { population: towers.map(t => ({ id: t.id, lat: t.lat, lon: t.lon })), business };
    for (let i = 0; i < targets.length; i += CHUNK) {
        const batch = targets.slice(i, i + CHUNK);
        await scoreTowers(prisma as never, batch, model, inputs);
        written += batch.length;
        console.log(`scored ${written}/${targets.length}`);
    }

    // Rows this run skipped (labeled, or an excluded status) can still hold a score from an older model.
    const cleared = await prisma.tower.updateMany({
        where: staleTowerWhere(model.version),
        data: { aiTowerScore: null, aiLabel: null, aiClassifiedAt: null, aiModelVersion: null },
    });
    console.log(`cleared ${cleared.count} stale scores from older model versions`);

    const dist = await prisma.tower.groupBy({
        by: ['aiLabel'],
        where: { aiModelVersion: model.version },
        _count: { _all: true },
    });
    console.log('\n--- scoring summary ---');
    dist.forEach(d => console.log(`${d.aiLabel}: ${d._count._all}`));

    const spot = async (order: 'desc' | 'asc', label: string) => {
        const rows = await prisma.tower.findMany({
            where: { aiModelVersion: model.version },
            orderBy: { aiTowerScore: order },
            take: 5,
            select: { id: true, aiTowerScore: true, lat: true, lon: true, businessCount: true },
        });
        console.log(label);
        rows.forEach(t => console.log(`  #${t.id} score=${t.aiTowerScore?.toFixed(3)} businesses=${t.businessCount} https://www.google.com/maps/@${t.lat},${t.lon},120m/data=!3m1!1e3`));
    };
    console.log('\ntop 5 (spot-check on satellite):');
    await spot('desc', '');
    console.log('bottom 5:');
    await spot('asc', '');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());