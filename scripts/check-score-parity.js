// Decisive parity test: recompute scores using only the population that
// existed when the last scoring run happened (towers are excluded if they were
// created after it). If deltas collapse to zero, the new towers are the cause
// and score-batch.js is faithful to the model.
//
// Usage: node scripts/check-score-parity.js [sampleSize]
require('dotenv').config({ quiet: true });
const path = require('node:path');
const createJiti = require('jiti');
const { PrismaClient } = require('@prisma/client');

const jiti = createJiti(__filename, { interopDefault: true });
const score = jiti(path.join(process.cwd(), 'src', 'lib', 'ml', 'score.ts'));
const { buildTowerContext, towerToFeatures } = jiti(path.join(process.cwd(), 'src', 'lib', 'ml', 'features.ts'));

const prisma = new PrismaClient();
const SAMPLE = Number(process.argv[2]) || 100;

(async () => {
    const model = score.loadTowerModel();
    const anchors = await prisma.$queryRawUnsafe(
        `SELECT min("aiClassifiedAt") AS "first", max("aiClassifiedAt") AS "last"
         FROM "Tower" WHERE "aiModelVersion" = $1`, model.version,
    );
    const scoredAt = anchors[0].last;
    console.log(`model ${model.version}, stored scores written by ${scoredAt?.toISOString() ?? 'unknown'}`);

    const sample = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Tower" WHERE "aiTowerScore" IS NOT NULL AND "aiClassifiedAt" = $1 ORDER BY random() LIMIT ${SAMPLE}`,
        scoredAt,
    );
    const ids = sample.map((row) => row.id);

    const towers = await prisma.tower.findMany({ where: { id: { in: ids } }, select: score.TOWER_SELECT });
    const storedRows = await prisma.tower.findMany({
        where: { id: { in: ids } },
        select: { id: true, aiTowerScore: true },
    });
    const stored = new Map(storedRows.map((row) => [row.id, row.aiTowerScore]));

    const inputs = await score.loadScoreInputs(prisma, ids);
    const createdAt = new Map(
        (await prisma.$queryRawUnsafe(
            `SELECT id, "createdAt" FROM "Tower" WHERE id = ANY($1::int[])`,
            inputs.population.map((t) => t.id),
        )).map((t) => [t.id, t.createdAt]),
    );
    const before = inputs.population.filter((t) => (createdAt.get(t.id) ?? 0) <= scoredAt);

    const report = (label, population) => {
        const ctx = buildTowerContext(population, inputs.business, inputs.registry);
        const deltas = towers.map((tower) => {
            const [p] = model.clf.predictProbability([towerToFeatures(tower, ctx)], 1);
            return Math.abs(Number(p) - (stored.get(tower.id) ?? 0));
        }).sort((a, b) => a - b);
        const exact = deltas.filter((d) => d < 1e-9).length;
        const pct = (q) => deltas[Math.min(deltas.length - 1, Math.floor(q * deltas.length))];
        console.log(`${label}: population ${population.length}, exact ${exact}/${deltas.length}, p50 ${pct(0.5).toFixed(4)}, max ${deltas[deltas.length - 1].toFixed(4)}`);
    };

    console.log(`sample: ${towers.length} towers scored in that same run`);
    report('today   ', inputs.population);
    report('at run  ', before);
    console.log(`created since the run: ${inputs.population.length - before.length}`);
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
