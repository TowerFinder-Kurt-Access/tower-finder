/**
 * Train the tower vs not_tower classifier on backfilled Tower.humanLabel rows
 * (see scripts/backfill-tower-labels.ts) and serialize it for scoring.
 *
 * Reports held-out AUC, precision/recall, confusion matrix, and permutation
 * feature importance. Writes src/lib/ml/model.json.
 *
 * Run: npx tsx --env-file=.env scripts/train-tower-classifier.ts
 */
import { PrismaClient } from '@prisma/client';
import { RandomForestClassifier } from 'ml-random-forest';
import * as fs from 'fs';
import * as path from 'path';
import { buildTowerContext, towerToFeatures, FEATURE_NAMES, FeatureTower } from '../src/lib/ml/features';

const prisma = new PrismaClient();

const SEED = 42;
const TEST_FRACTION = 0.2;
const MODEL_VERSION = `rf-v1-${new Date().toISOString().slice(0, 10)}`;

// deterministic RNG (mulberry32) so the split is reproducible
function rng(seed: number) {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Rank-based AUC (probability a random positive scores above a random negative). */
function auc(scores: number[], labels: number[]): number {
    const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
    let rank = 1, sumPosRanks = 0, nPos = 0, nNeg = 0;
    for (let i = 0; i < pairs.length;) {
        let j = i;
        while (j < pairs.length && pairs[j].s === pairs[i].s) j++;
        const avgRank = (rank + rank + (j - i) - 1) / 2;
        for (let k = i; k < j; k++) {
            if (pairs[k].y === 1) { sumPosRanks += avgRank; nPos++; } else { nNeg++; }
        }
        rank += j - i;
        i = j;
    }
    return nPos === 0 || nNeg === 0 ? NaN : (sumPosRanks - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}

// ml-random-forest's predictProbability(toPredict, label) = fraction of trees
// voting for `label`
function probabilityOfPositive(clf: RandomForestClassifier, X: number[][]): number[] {
    return (clf as any).predictProbability(X, 1) as number[];
}

async function main() {
    const towers = await prisma.tower.findMany({
        select: {
            id: true, lat: true, lon: true, source: true,
            businessCount: true, avgBusinessDistance: true, humanLabel: true,
        },
    });
    const ctx = buildTowerContext(towers);
    const labeled = towers.filter(t => t.humanLabel === 'tower' || t.humanLabel === 'not_tower');
    console.log(`towers: ${towers.length}, labeled: ${labeled.length}`);

    const rand = rng(SEED);
    const pos = shuffled(labeled.filter(t => t.humanLabel === 'tower'), rand);
    const neg = shuffled(labeled.filter(t => t.humanLabel === 'not_tower'), rand);
    console.log(`class balance: tower=${pos.length}, not_tower=${neg.length}`);

    const split = <T>(arr: T[]) => {
        const nTest = Math.round(arr.length * TEST_FRACTION);
        return { test: arr.slice(0, nTest), train: arr.slice(nTest) };
    };
    const p = split(pos), n = split(neg);
    const train = shuffled([...p.train, ...n.train], rand);
    const test = [...p.test, ...n.test];

    const toXY = (rows: typeof labeled) => ({
        X: rows.map(t => towerToFeatures(t as FeatureTower, ctx)),
        y: rows.map(t => (t.humanLabel === 'tower' ? 1 : 0)),
    });
    console.log('extracting features...');
    const tr = toXY(train);
    const te = toXY(test);

    console.log(`training random forest on ${tr.X.length} rows (${FEATURE_NAMES.length} features)...`);
    // Kept deliberately light: ml-random-forest's pure-JS CART is slow on
    // continuous features, and this script is part of the routine retrain loop.
    const clf = new RandomForestClassifier({
        seed: SEED,
        nEstimators: 80,
        maxFeatures: 0.5,
        treeOptions: { maxDepth: 8, minNumSamples: 10 },
        useSampleBagging: true,
    });
    clf.train(tr.X, tr.y);

    const probs = probabilityOfPositive(clf, te.X);
    const testAuc = auc(probs, te.y);

    const threshold = 0.5;
    let tp = 0, fp = 0, tn = 0, fn = 0;
    probs.forEach((pr, i) => {
        const pred = pr >= threshold ? 1 : 0;
        if (pred === 1 && te.y[i] === 1) tp++;
        else if (pred === 1) fp++;
        else if (te.y[i] === 0) tn++;
        else fn++;
    });
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);

    console.log('\n--- held-out evaluation ---');
    console.log(`test set: ${te.y.length} rows (${te.y.filter(v => v === 1).length} tower / ${te.y.filter(v => v === 0).length} not_tower)`);
    console.log(`AUC:       ${testAuc.toFixed(4)}`);
    console.log(`precision: ${precision.toFixed(3)}  recall: ${recall.toFixed(3)}  (threshold ${threshold})`);
    console.log(`confusion: TP=${tp} FP=${fp} TN=${tn} FN=${fn}`);

    // permutation importance: AUC drop when one feature is shuffled
    console.log('\n--- permutation feature importance (AUC drop) ---');
    const importance: { name: string; drop: number }[] = [];
    for (let f = 0; f < FEATURE_NAMES.length; f++) {
        const permuted = te.X.map(row => [...row]);
        const colVals = shuffled(permuted.map(r => r[f]), rand);
        permuted.forEach((r, i) => { r[f] = colVals[i]; });
        const permAuc = auc(probabilityOfPositive(clf, permuted), te.y);
        importance.push({ name: FEATURE_NAMES[f], drop: testAuc - permAuc });
    }
    importance.sort((a, b) => b.drop - a.drop);
    for (const { name, drop } of importance) {
        console.log(`${name.padEnd(26)} ${drop >= 0 ? '+' : ''}${drop.toFixed(4)}`);
    }

    const outPath = path.join(process.cwd(), 'src', 'lib', 'ml', 'model.json');
    fs.writeFileSync(outPath, JSON.stringify({
        version: MODEL_VERSION,
        featureNames: FEATURE_NAMES,
        threshold,
        metrics: {
            auc: testAuc, precision, recall,
            confusion: { tp, fp, tn, fn },
            trainSize: tr.X.length, testSize: te.X.length,
        },
        model: clf.toJSON(),
    }), 'utf8');
    console.log(`\nModel written to ${outPath} (version ${MODEL_VERSION})`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
