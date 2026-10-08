import { RandomForestClassifier } from 'ml-random-forest';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
    buildTowerContext, towerToFeatures, FEATURE_NAMES,
    BUSINESS_FEATURES_SQL, BUSINESS_FEATURES_FOR_IDS_SQL, BusinessAggregate,
} from './features';
import { loadRegistryStructures, buildRegistryIndex } from './registry';
import type { RegistryIndex } from './registry';

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

export const NEW_STATUS_ID = 1;

export function isScorable(t: { humanLabel: string | null; statusId: number | null }): boolean {
    return t.humanLabel === null && (t.statusId === null || t.statusId === NEW_STATUS_ID);
}

export function staleTowerWhere(version: string) {
    return { aiModelVersion: { not: version } };
}

export interface ScoreBatchResult {
    scored: number;
    cleared: number;
}

export async function allBusinessAggregates(db: ScoreDb): Promise<BusinessAggregate[]> {
    // SAFETY: the query is the constant above; the row shape is fixed by its SELECT list.
    return db.$queryRawUnsafe(BUSINESS_FEATURES_SQL) as unknown as BusinessAggregate[];
}

export async function businessAggregatesFor(db: ScoreDb, ids: number[]): Promise<BusinessAggregate[]> {
    // SAFETY: $1 is bound by Prisma, so no id reaches the SQL string.
    return db.$queryRawUnsafe(BUSINESS_FEATURES_FOR_IDS_SQL, ids) as unknown as BusinessAggregate[];
}

export interface ScoreInputs {
    // Every tower, not just the batch: density features shift if scoped to the batch.
    population: PopulationTower[];
    business: BusinessAggregate[];
    registry?: RegistryIndex;
}

export async function loadScoreInputs(db: ScoreDb, batchIds: number[]): Promise<ScoreInputs> {
    const population = await db.tower.findMany({ select: { id: true, lat: true, lon: true } }) as PopulationTower[];
    // Registry evidence comes from the file cache, never the database.
    const structures = loadRegistryStructures();
    return {
        population,
        business: await businessAggregatesFor(db, batchIds),
        registry: structures.length > 0 ? buildRegistryIndex(structures) : undefined,
    };
}

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
        const ctx = buildTowerContext(inputs.population, inputs.business, inputs.registry);
        const X = scorable.map(t => towerToFeatures(t, ctx));
        // SAFETY: ml-random-forest ships no type for predictProbability.
        const probs = (model.clf as unknown as {
            predictProbability(x: number[][], label: number): number[];
        }).predictProbability(X, 1);
        // Batched VALUES update: one statement per batch instead of one round trip per row.
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