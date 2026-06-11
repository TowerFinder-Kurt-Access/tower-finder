/**
 * Score unreviewed towers with the trained classifier (src/lib/ml/model.json,
 * produced by scripts/train-tower-classifier.ts).
 *
 * Targets towers with no human label and no review status (statusId null or
 * "New") — already-reviewed ambiguous statuses (Duplicate, Not Interested, …)
 * are left unscored on purpose. Re-runnable: rescoring overwrites previous
 * scores, so run it again after each retrain.
 *
 * Run: npx tsx --env-file=.env scripts/score-towers.ts
 */
import { PrismaClient } from '@prisma/client';
import { RandomForestClassifier } from 'ml-random-forest';
import * as fs from 'fs';
import * as path from 'path';
import { buildTowerContext, towerToFeatures, FEATURE_NAMES, FeatureTower } from '../src/lib/ml/features';

const prisma = new PrismaClient();

const NEW_STATUS_ID = 1;

async function main() {
    const modelPath = path.join(process.cwd(), 'src', 'lib', 'ml', 'model.json');
    const saved = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    if (JSON.stringify(saved.featureNames) !== JSON.stringify(FEATURE_NAMES)) {
        throw new Error('model.json featureNames do not match src/lib/ml/features.ts — retrain before scoring');
    }
    const clf = RandomForestClassifier.load(saved.model);
    console.log(`model ${saved.version} (held-out AUC ${saved.metrics.auc.toFixed(3)}), threshold ${saved.threshold}`);

    const towers = await prisma.tower.findMany({
        select: {
            id: true, lat: true, lon: true, source: true,
            businessCount: true, avgBusinessDistance: true,
            humanLabel: true, statusId: true,
        },
    });
    const ctx = buildTowerContext(towers);

    const targets = towers.filter(t =>
        t.humanLabel === null && (t.statusId === null || t.statusId === NEW_STATUS_ID)
    );
    console.log(`scoring ${targets.length} unreviewed towers...`);

    // Batched VALUES updates: one statement per chunk instead of one round
    // trip per row (the hosted DB makes per-row updates ~100x slower).
    const threshold = Number(saved.threshold);
    const version = String(saved.version).replace(/[^a-zA-Z0-9._-]/g, '');
    const CHUNK = 2000;
    let written = 0;
    for (let i = 0; i < targets.length; i += CHUNK) {
        const batch = targets.slice(i, i + CHUNK);
        const X = batch.map(t => towerToFeatures(t as FeatureTower, ctx));
        const probs = (clf as any).predictProbability(X, 1) as number[];
        const values = batch
            .map((t, j) => `(${Number(t.id)}, ${Number(probs[j])})`)
            .join(',');
        await prisma.$executeRawUnsafe(`
            UPDATE "Tower" AS t SET
                "aiTowerScore" = v.score,
                "aiLabel" = CASE WHEN v.score >= ${threshold} THEN 'likely_tower' ELSE 'likely_not_tower' END,
                "aiClassifiedAt" = NOW(),
                "aiModelVersion" = '${version}'
            FROM (VALUES ${values}) AS v(id, score)
            WHERE t.id = v.id
        `);
        written += batch.length;
        console.log(`scored ${written}/${targets.length}`);
    }

    const dist = await prisma.tower.groupBy({
        by: ['aiLabel'],
        where: { aiModelVersion: saved.version },
        _count: { _all: true },
    });
    console.log('\n--- scoring summary ---');
    dist.forEach(d => console.log(`${d.aiLabel}: ${d._count._all}`));

    const top = await prisma.tower.findMany({
        where: { aiModelVersion: saved.version },
        orderBy: { aiTowerScore: 'desc' },
        take: 5,
        select: { id: true, aiTowerScore: true, lat: true, lon: true, businessCount: true },
    });
    const bottom = await prisma.tower.findMany({
        where: { aiModelVersion: saved.version },
        orderBy: { aiTowerScore: 'asc' },
        take: 5,
        select: { id: true, aiTowerScore: true, lat: true, lon: true, businessCount: true },
    });
    console.log('\ntop 5 (spot-check on satellite):');
    top.forEach(t => console.log(`  #${t.id} score=${t.aiTowerScore?.toFixed(3)} businesses=${t.businessCount} https://www.google.com/maps/@${t.lat},${t.lon},120m/data=!3m1!1e3`));
    console.log('bottom 5:');
    bottom.forEach(t => console.log(`  #${t.id} score=${t.aiTowerScore?.toFixed(3)} businesses=${t.businessCount} https://www.google.com/maps/@${t.lat},${t.lon},120m/data=!3m1!1e3`));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
