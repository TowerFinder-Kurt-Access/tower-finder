/**
 * Scoring core shared by scripts/score-towers.ts and the score_towers cron job.
 * One implementation so the manual run and the scheduled run can never disagree.
 */
import { RandomForestClassifier } from 'ml-random-forest';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
    buildTowerContext, towerToFeatures, FEATURE_NAMES,
    BUSINESS_FEATURES_SQL, BUSINESS_FEATURES_FOR_IDS_SQL, BusinessAggregate,
} from './features';

/**
 * The slice of Prisma this module needs, so callers can pass their own client.
 * Declared as methods on purpose: TS checks method parameters bivariantly, so both
 * the plain PrismaClient used by scripts and the accelerate-extended app client fit.
 */
export interface ScoreDb {
    tower: {
        findMany(args: unknown): Promise<unknown[]>;
        updateMany(args: unknown): Promise<{ count: number }>;
    };
    $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
    $executeRaw(query: Prisma.Sql): Promise<number>;
}

export interface TowerModel {
    version: string;
    threshold: number;
    clf: RandomForestClassifier;
    metrics: { auc: number; precision: number; recall: number };
}

export interface ScorableTower {
    id: number;
    lat: number;
    lon: number;
    source: string;
    businessCount: number | null;
    avgBusinessDistance: number | null;
    humanLabel: string | null;
    statusId: number | null;
}

export interface PopulationTower {
    id: number;
    lat: number;
    lon: number;
}

export const TOWER_SELECT = {
    id: true, lat: true, lon: true, source: true,
    businessCount: true, avgBusinessDistance: true,
    humanLabel: true, statusId: true,
} as const;

export function loadTowerModel(): TowerModel {
    const modelPath = path.join(process.cwd(), 'src', 'lib', 'ml', 'model.json');
    let saved: {
        version: string;
        threshold: number;
        featureNames: string[];
        metrics: { auc: number; precision: number; recall: number };
        model: unknown;
    };
    try {
        saved = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    } catch (e) {
        throw new Error(
            `cannot read model at ${modelPath}: run scripts/train-tower-classifier.ts first (${(e as Error).message})`
        );
    }
    if (JSON.stringify(saved.featureNames) !== JSON.stringify(FEATURE_NAMES)) {
        throw new Error('model.json featureNames do not match src/lib/ml/features.ts — retrain before scoring');
    }
    return {
        version: String(saved.version).replace(/[^a-zA-Z0-9._-]/g, ''),
        threshold: Number(saved.threshold),
        clf: RandomForestClassifier.load(saved.model as never),
        metrics: saved.metrics,
    };
}

/** Statuses the scorer deliberately ignores: already reviewed, or not a verdict at all. */
export const NEW_STATUS_ID = 1;

export function isScorable(t: { humanLabel: string | null; statusId: number | null }): boolean {
    return t.humanLabel === null && (t.statusId === null || t.statusId === NEW_STATUS_ID);
}

/** Towers this model version has not processed yet: new rows, plus stale scores. */
export function staleTowerWhere(version: string) {
    return { aiModelVersion: { not: version } };
}

export interface ScoreBatchResult {
    scored: number;
    cleared: number;
}

/** Aggregates for the whole table, for callers doing a single full pass. */
export async function allBusinessAggregates(db: ScoreDb): Promise<BusinessAggregate[]> {
    // SAFETY: the query is the constant above; the row shape is fixed by its SELECT list.
    return db.$queryRawUnsafe(BUSINESS_FEATURES_SQL) as unknown as BusinessAggregate[];
}

/** Business aggregates for one batch only. */
export async function businessAggregatesFor(db: ScoreDb, ids: number[]): Promise<BusinessAggregate[]> {
    // SAFETY: $1 is bound by Prisma, so no id reaches the SQL string.
    return db.$queryRawUnsafe(BUSINESS_FEATURES_FOR_IDS_SQL, ids) as unknown as BusinessAggregate[];
}

export interface ScoreInputs {
    /**
     * EVERY tower with coordinates, not just the batch. logNearestTowerM and
     * towersWithin1Ring are measured against this population, so scoring a batch
     * against itself silently produces different scores than a full pass.
     */
    population: PopulationTower[];
    /** Business aggregates for the towers being scored. */
    business: BusinessAggregate[];
}

export async function loadScoreInputs(db: ScoreDb, batchIds: number[]): Promise<ScoreInputs> {
    const population = await db.tower.findMany({ select: { id: true, lat: true, lon: true } }) as PopulationTower[];
    return { population, business: await businessAggregatesFor(db, batchIds) };
}

/**
 * Scores one batch of towers. Rows that fail isScorable get their score cleared rather
 * than kept: an older model's probability is not comparable with this one's, so leaving
 * it in place would mix two scales in the same sortable column.
 */
export async function scoreTowers(
    db: ScoreDb,
    towers: ScorableTower[],
    model: TowerModel,
    inputs: ScoreInputs
): Promise<ScoreBatchResult> {
    const scorable = towers.filter(isScorable);
    const skipped = towers.filter(t => !isScorable(t));
    let scored = 0;

    if (scorable.length) {
        const ctx = buildTowerContext(inputs.population, inputs.business);
        const X = scorable.map(t => towerToFeatures(t, ctx));
        // SAFETY: ml-random-forest ships no type for predictProbability. Its documented
        // contract is the fraction of trees voting for the label index passed second.
        const probs = (model.clf as unknown as {
            predictProbability(x: number[][], label: number): number[];
        }).predictProbability(X, 1);
        // Batched VALUES update: one statement per batch instead of one round trip per
        // row. Every id and score is bound as a parameter via Prisma.join, never spliced.
        const rows = scorable.map((t, j) => Prisma.sql`(${t.id}::int, ${Number(probs[j])}::float8)`);
        await db.$executeRaw(Prisma.sql`
            UPDATE "Tower" AS t SET
                "aiTowerScore" = v.score,
                "aiLabel" = CASE WHEN v.score >= ${model.threshold} THEN 'likely_tower' ELSE 'likely_not_tower' END,
                "aiClassifiedAt" = NOW(),
                "aiModelVersion" = ${model.version}
            FROM (VALUES ${Prisma.join(rows)}) AS v(id, score)
            WHERE t.id = v.id
        `);
        scored = scorable.length;
    }

    let cleared = 0;
    if (skipped.length) {
        const res = await db.tower.updateMany({
            where: { id: { in: skipped.map(t => t.id) } },
            data: { aiTowerScore: null, aiLabel: null, aiClassifiedAt: null, aiModelVersion: null },
        });
        cleared = res.count;
    }
    return { scored, cleared };
}