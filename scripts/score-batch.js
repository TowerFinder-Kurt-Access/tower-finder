// Scores imported towers with the project's own scoring code, loaded through
// jiti so the TypeScript sources run unchanged.
//
// scripts/score-towers.ts needs tsx, which is not installed. This does the same
// work through jiti, and calls the same scoreTowers() so features, rounding and
// the label threshold stay in one place.
//
// Usage:
//   node scripts/score-batch.js                     # only towers with no score
//   node scripts/score-batch.js --batch=<tag>       # one import batch
//   node scripts/score-batch.js --write             # persist (default is dry run)
require('dotenv').config({ quiet: true });
const path = require('node:path');
const createJiti = require('jiti');
const { PrismaClient } = require('@prisma/client');

const BATCH = (process.argv.find((a) => a.startsWith('--batch=')) || '').split('=')[1] || null;
const WRITE = process.argv.includes('--write');
const CHUNK = 5000;

const jiti = createJiti(__filename, { interopDefault: true });
const score = jiti(path.join(process.cwd(), 'src', 'lib', 'ml', 'score.ts'));

const prisma = new PrismaClient();

(async () => {
    const model = score.loadTowerModel();
    console.log(`model ${model.version} (held-out AUC ${model.metrics.auc.toFixed(3)}), threshold ${model.threshold.toFixed(3)}`);

    const target = BATCH
        ? { rawImportData: { path: ['_batch'], equals: BATCH }, aiTowerScore: null }
        : { aiTowerScore: null };
    const todo = await prisma.tower.findMany({ where: target, select: score.TOWER_SELECT });
    console.log(`unscored targets: ${todo.length}${BATCH ? ` (batch ${BATCH})` : ''}`);
    if (todo.length === 0) {
        console.log('nothing to score');
        return;
    }

    const inputs = await score.loadScoreInputs(prisma, todo.map((t) => t.id));
    console.log(`population: ${inputs.population.length}, business aggregates: ${inputs.business.length}`);

    // Preview without writing: recompute the same features scoreTowers uses.
    const { buildTowerContext, towerToFeatures } = jiti(path.join(process.cwd(), 'src', 'lib', 'ml', 'features.ts'));
    const ctx = buildTowerContext(inputs.population, inputs.business, inputs.registry);
    const preview = todo.map((tower) => {
        const [p] = model.clf.predictProbability([towerToFeatures(tower, ctx)], 1);
        return Number(p);
    });
    const labels = { likely_tower: 0, likely_not_tower: 0 };
    for (const p of preview) labels[p >= model.threshold ? 'likely_tower' : 'likely_not_tower'] += 1;
    console.log(`labels: ${JSON.stringify(labels)}`);
    console.log(`score range: ${Math.min(...preview).toFixed(3)} - ${Math.max(...preview).toFixed(3)}`);

    if (!WRITE) {
        console.log('\nDry run only. Add --write to persist.');
        return;
    }

    for (let i = 0; i < todo.length; i += CHUNK) {
        const batch = todo.slice(i, i + CHUNK);
        await score.scoreTowers(prisma, batch, model, inputs);
        console.log(`wrote ${Math.min(i + CHUNK, todo.length)}/${todo.length}`);
    }
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
