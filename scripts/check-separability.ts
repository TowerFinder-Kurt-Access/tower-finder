import { PrismaClient } from '@prisma/client';
import { buildTowerContext, towerToFeatures, FEATURE_NAMES } from '../src/lib/ml/features';
import { loadRegistryStructures, buildRegistryIndex } from '../src/lib/ml/registry';

const prisma = new PrismaClient();

// Per-feature single-variable AUC on the real labeled set. A feature near 1.0
// is a label proxy: the forest will find it and shortcut the measurement.
function auc(scores: number[], labels: number[]): number {
    const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
    let rank = 1, sumPos = 0, nPos = 0, nNeg = 0;
    for (let i = 0; i < pairs.length;) {
        let j = i;
        while (j < pairs.length && pairs[j].s === pairs[i].s) j++;
        const avg = (rank + rank + (j - i) - 1) / 2;
        for (let k = i; k < j; k++) { if (pairs[k].y === 1) { sumPos += avg; nPos++; } else nNeg++; }
        rank += (j - i); i = j;
    }
    return nPos === 0 || nNeg === 0 ? NaN : (sumPos - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}

async function main(): Promise<void> {
    const towers = await prisma.tower.findMany({
        where: { humanLabel: { in: ['tower', 'not_tower'] } },
        select: { id: true, lat: true, lon: true, source: true, businessCount: true, avgBusinessDistance: true, humanLabel: true },
        orderBy: { id: 'asc' },
    });
    const biz = await prisma.$queryRawUnsafe(`
        SELECT "towerId"::int AS "towerId", count(*)::int AS n,
               count(*) FILTER (WHERE "distance" <= 150)::int AS n150,
               count(*) FILTER (WHERE "distance" <= 400)::int AS n400,
               min("distance")::float AS "minM",
               count(DISTINCT "rawData"->'properties'->'categories'->>0)::int AS cats
        FROM "BusinessNearby" GROUP BY "towerId"
    `) as { towerId: number; n: number; n150: number; n400: number; minM: number; cats: number }[];
    const structs = loadRegistryStructures();
    const ctx = buildTowerContext(towers, biz, structs.length ? buildRegistryIndex(structs) : undefined);
    const labels = towers.map(t => (t.humanLabel === 'tower' ? 1 : 0));
    const cols: number[][] = towers.map(() => [] as number[]);
    towers.forEach((t, i) => towerToFeatures(t, ctx).forEach((v, j) => { cols[j].push(v); }));
    console.log(`labeled rows: ${towers.length}, tower=${labels.filter(x => x === 1).length}, not_tower=${labels.filter(x => x === 0).length}`);
    FEATURE_NAMES.forEach((n, j) => {
        const a = auc(cols[j], labels);
        console.log(`${n.padEnd(22)} ${a.toFixed(3)}${a > 0.7 ? '   <-- label proxy' : ''}`);
    });
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
