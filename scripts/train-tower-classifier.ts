/** Reports held-out AUC, precision/recall, confusion matrix, and permutation feature importance. */
import { PrismaClient } from '@prisma/client';
import { RandomForestClassifier } from 'ml-random-forest';
import * as fs from 'fs';
import * as path from 'path';
import { buildTowerContext, towerToFeatures, FEATURE_NAMES, FeatureTower, BUSINESS_FEATURES_SQL, BusinessAggregate } from '../src/lib/ml/features';
import { loadRegistryStructures, buildRegistryIndex } from '../src/lib/ml/registry';

const prisma = new PrismaClient();

const SEED = 42;
const TEST_FRACTION = 0.2;
const MODEL_VERSION = `rf-v2-${new Date().toISOString().slice(0, 10)}`;

/** Precision budget for the stored threshold. */
const TARGET_PRECISION = 0.75;

// deterministic RNG (mulberry32) so the split is reproducible.
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

// ml-random-forest's predictProbability(toPredict, label) = fraction of trees voting for `label`.
function probabilityOfPositive(clf: RandomForestClassifier, X: number[][]): number[] {
    return (clf as any).predictProbability(X, 1) as number[];
}

// Threshold selection: the lowest score whose precision still meets the
// target, scanning upward. The test set drives a tight precision band, so the
// calibration point is where flagged volume first reaches the target. Flipping
// this to a high-end scan returns a near-perfect 0-5 row set and collapses
// recall, which is the wrong trade for a review queue.
function pickThreshold(scores: number[], labels: number[], target: number): number {
    let best = 0.5;
    for (const t of [...new Set(scores)].sort((a, b) => a - b)) {
        let tp = 0, fp = 0;
        scores.forEach((s, i) => { if (s >= t) { if (labels[i] === 1) tp++; else fp++; } });
        const precision = tp / Math.max(tp + fp, 1);
        best = t;
        if (precision >= target) return t;
    }
    return best;
}

const GROUPED = process.argv.includes('--grouped');
const BORDER_PURGE_M = 5000;

function groupKey(t: { parcel?: { provinceRaw?: string | null; stateRaw?: string | null; country?: string | null } | null; lat: number }): string {
    // Province/state buckets keep whole regions in one split. The country
    // prefix separates colliding codes (California vs Canada). Towers carry
    // no region column, so fall back to a ~110 km latitude band for US rows.
    const c = (t.parcel?.country ?? '').trim().toUpperCase();
    const p = (t.parcel?.provinceRaw ?? '').trim() || (t.parcel?.stateRaw ?? '').trim();
    if (p) return `${c || '?'}:${p.toLowerCase()}`;
    return `lat:${Math.floor(t.lat)}`;
}

function haversineSplitM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

function groupedSplit<T extends { lat: number; lon: number; humanLabel: string | null }>(labeled: T[], rand: () => number) {
    const groups = new Map<string, T[]>();
    for (const t of labeled) {
        const k = groupKey(t);
        const list = groups.get(k) ?? [];
        list.push(t);
        groups.set(k, list);
    }
    // Stratified group assignment: deal whole groups largest-first into the
    // split furthest below its target share (test 0.2, validation 0.2, train
    // 0.6), so every region lands in every split in proportion. Tiny
    // all-positive US state groups stay whole and spread across splits.
    const ordered = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
    const buckets: T[][] = [[], [], []];
    const totals = [0, 0, 0];
    const targets = [0.6, 0.2, 0.2];
    const total = labeled.length;
    for (const [, rows] of ordered) {
        let bi = 0;
        let worst = -Infinity;
        for (let i = 0; i < 3; i++) {
            const deficit = targets[i] - totals[i] / total;
            if (deficit > worst) {
                worst = deficit;
                bi = i;
            }
        }
        buckets[bi].push(...rows);
        totals[bi] += rows.length;
    }
    // buckets[1] is validation, buckets[2] is test.
    const test = buckets[2];
    const validation = buckets[1];
    // Purge the border strip: nearest-tower features cross group boundaries.
    const train = buckets[0].filter((t) => !test.some((u) => haversineSplitM(t, u) <= BORDER_PURGE_M));
    return { train: shuffled(train, rand), validation: shuffled(validation, rand), test: shuffled(test, rand) };
}

async function main() {
    const towers = await prisma.tower.findMany({
        orderBy: { id: 'asc' },
        select: {
            id: true, lat: true, lon: true, source: true,
            businessCount: true, avgBusinessDistance: true, humanLabel: true,
            parcel: { select: { provinceRaw: true, stateRaw: true, country: true } },
        },
    });
    console.log('loading business aggregates...');
    const business = await prisma.$queryRawUnsafe(BUSINESS_FEATURES_SQL) as BusinessAggregate[];
    console.log(`business aggregates: ${business.length}`);
    console.log('loading registry structures...');
    const structures = loadRegistryStructures();
    const registry = structures.length > 0 ? buildRegistryIndex(structures) : undefined;
    console.log(`registry structures: ${structures.length}`);
    // Density features over the full population: nearest-tower distance is a
    // property of the live tower map, not of the labeled sample. Restricting
    // the context to labeled rows changes the feature distribution between
    // training and scoring.
    const ctx = buildTowerContext(towers, business, registry);
    const labeled = towers.filter(t => t.humanLabel === 'tower' || t.humanLabel === 'not_tower');
    console.log(`towers: ${towers.length}, labeled: ${labeled.length}`);

    const rand = rng(SEED);
    const pos = shuffled(labeled.filter(t => t.humanLabel === 'tower'), rand);
    const neg = shuffled(labeled.filter(t => t.humanLabel === 'not_tower'), rand);
    console.log(`class balance: tower=${pos.length}, not_tower=${neg.length}`);

    // Grouped split (Part C gate): whole province/state groups go to exactly
    // one of train/validation/test, so region features cannot memorize. The
    // default random split stays for the v2-style number.
    const split = <T>(arr: T[]) => {
        const nTest = Math.round(arr.length * TEST_FRACTION);
        return { test: arr.slice(0, nTest), train: arr.slice(nTest) };
    };
    const p = split(pos), n = split(neg);
    const train = shuffled([...p.train, ...n.train], rand);
    const test = [...p.test, ...n.test];
    let grouped: { train: typeof labeled; validation: typeof labeled; test: typeof labeled } | null = null;
    if (GROUPED) {
        grouped = groupedSplit(labeled, rand);
        console.log(`grouped split: train=${grouped.train.length} validation=${grouped.validation.length} test=${grouped.test.length}`);
    }

    const toXY = (rows: typeof labeled) => ({
        X: rows.map(t => towerToFeatures(t as FeatureTower, ctx)),
        y: rows.map(t => (t.humanLabel === 'tower' ? 1 : 0)),
    });
    console.log('extracting features...');
    const tr = toXY(train);
    const te = toXY(test);

    console.log(`training random forest on ${tr.X.length} rows (${FEATURE_NAMES.length} features)...`);
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

    const threshold = pickThreshold(probs, te.y, TARGET_PRECISION);

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

    // Same comparison at the old fixed 0.5, so the move is measurable in the log.
    let p05 = 0, r05 = 0, flagged = 0;
    probs.forEach((pr, i) => {
        if (pr >= 0.5) {
            flagged++;
            if (te.y[i] === 1) p05++;
        } else if (te.y[i] === 1) r05++;
    });
    const recallAt05 = p05 / (p05 + r05);
    const precisionAt05 = p05 / Math.max(flagged, 1);

    // Max-F1 is reported for context only.
    let bestF1 = { t: 0, f1: 0, precision: 0, recall: 0 };
    for (const t of Array.from(new Set(probs)).sort((a, b) => a - b)) {
        let btp = 0, bfp = 0, bfn = 0;
        probs.forEach((pr, i) => { if (pr >= t) { if (te.y[i] === 1) btp++; else bfp++; } else if (te.y[i] === 1) bfn++; });
        const bprecision = btp / Math.max(btp + bfp, 1), brecall = btp / Math.max(btp + bfn, 1);
        const bf1 = 2 * bprecision * brecall / Math.max(bprecision + brecall, 1e-9);
        if (bf1 > bestF1.f1) bestF1 = { t, f1: bf1, precision: bprecision, recall: brecall };
    }

    console.log('\n--- held-out evaluation ---');
    console.log(`test set: ${te.y.length} rows (${te.y.filter(v => v === 1).length} tower / ${te.y.filter(v => v === 0).length} not_tower)`);
    console.log(`AUC:       ${testAuc.toFixed(4)}`);
    console.log(`precision: ${precision.toFixed(3)}  recall: ${recall.toFixed(3)}  (threshold ${threshold.toFixed(3)}, target precision ${TARGET_PRECISION})`);
    console.log(`confusion: TP=${tp} FP=${fp} TN=${tn} FN=${fn}`);
    console.log(`flagged share at threshold: ${(100 * (tp + fp) / te.y.length).toFixed(1)}%`);
    console.log(`for comparison, fixed 0.5: precision ${precisionAt05.toFixed(3)} recall ${recallAt05.toFixed(3)} (flagged ${(100 * flagged / te.y.length).toFixed(1)}%)`);
    console.log(`max-F1 point: t=${bestF1.t.toFixed(3)} precision ${bestF1.precision.toFixed(3)} recall ${bestF1.recall.toFixed(3)} F1 ${bestF1.f1.toFixed(3)} (reference only)`);

    // permutation importance: AUC drop when one feature is shuffled.
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

    // Grouped gate (Part C): the labeled rows are re-split by region, each
    // ablation trains on the grouped train set, picks its own threshold on
    // validation, and reports once on the fixed test set. Report only.
    if (grouped) {
        const gTr = toXY(grouped.train);
        const gVal = toXY(grouped.validation);
        const gTe = toXY(grouped.test);
        const sub = (rows: number[][], cols: number[]) => rows.map((r) => cols.map((c) => r[c]));
        const regionCols = FEATURE_NAMES.map((n, i) => (n === 'lat' || n === 'lon' || n.startsWith('src_') ? i : -1)).filter((i) => i >= 0);
        const bizNames = ['bizCount', 'bizWithin150', 'bizWithin400', 'logNearestBusinessM', 'bizCategoryKinds'];
        const bizCols = FEATURE_NAMES.map((n, i) => (regionCols.includes(i) || bizNames.includes(n) ? i : -1)).filter((i) => i >= 0);
        const allCols = FEATURE_NAMES.map((_, i) => i);
        const runAblation = (name: string, cols: number[]) => {
            const gClf = new RandomForestClassifier({
                seed: SEED, nEstimators: 80, maxFeatures: 0.5,
                treeOptions: { maxDepth: 8, minNumSamples: 10 }, useSampleBagging: true,
            });
            gClf.train(sub(gTr.X, cols), gTr.y);
            // Own threshold from validation: cutoffs do not transfer across
            // feature sets.
            const t = pickThreshold(probabilityOfPositive(gClf, sub(gVal.X, cols)), gVal.y, TARGET_PRECISION);
            const probs = probabilityOfPositive(gClf, sub(gTe.X, cols));
            let gtp = 0, gfp = 0, gfn = 0;
            probs.forEach((pr, i) => {
                if (pr >= t) { if (gTe.y[i] === 1) gtp++; else gfp++; }
                else if (gTe.y[i] === 1) gfn++;
            });
            console.log(`\n--- grouped gate: ${name} ---`);
            console.log(`AUC ${auc(probs, gTe.y).toFixed(4)}  precision ${(gtp / Math.max(gtp + gfp, 1)).toFixed(3)}  recall ${(gtp / Math.max(gtp + gfn, 1)).toFixed(3)}  (threshold ${t.toFixed(3)} from validation)`);
        };
        runAblation('region only', regionCols);
        runAblation('region + business', bizCols);
        runAblation('region + business + registry', allCols);
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
            targetPrecision: TARGET_PRECISION,
            precisionAt05, recallAt05,
            maxF1: bestF1,
        },
        model: clf.toJSON(),
    }), 'utf8');
    console.log(`\nModel written to ${outPath} (version ${MODEL_VERSION})`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
