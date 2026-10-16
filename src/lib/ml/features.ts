/** Feature extraction shared by training and scoring. */
import { latLngToCell, gridDisk } from 'h3-js';
import { registryEvidenceFor, REG_UNMEASURED } from './registry';
import type { RegistryIndex } from './registry';

const H3_RES = 8; // ~461 m hex edge
const MAX_RING = 4; // nearest-neighbor search horizon (~3.5 km)
const NEAREST_CAP_M = 5000;
const BIZ_UNMEASURED = 99;

// Region features are deliberately absent. Labels come from region-correlated
// sources (Canadian review spreadsheets, and US OpenStreetMap tags when those
// are in use), so any location column lets the forest infer the label instead
// of measuring the tower. All other features are honest: none of them separates
// the labeled set on its own (single-feature AUC 0.40-0.67).
export const FEATURE_NAMES: string[] = [
    'businessCount',
    'hasAvgBusinessDistance',
    'avgBusinessDistance',
    'logNearestTowerM',
    'towersWithin1Ring',
    'logNearestBusinessM',
    // Business aggregates read straight from BusinessNearby.
    'bizCount',
    'bizWithin150',
    'bizWithin400',
    'bizCategoryKinds',
    // Registry structures read from the file cache in data/registry-cache/.
    'regWithin150',
    'regWithin400',
    'logNearestRegistryM',
    'registryHeightM',
];

export interface BusinessAggregate {
    towerId: number;
    n: number;
    n150: number;
    n400: number;
    minM: number;
    cats: number;
}

export const BUSINESS_FEATURES_SQL = `
    SELECT "towerId"::int AS "towerId",
           count(*)::int AS n,
           count(*) FILTER (WHERE "distance" <= 150)::int AS n150,
           count(*) FILTER (WHERE "distance" <= 400)::int AS n400,
           min("distance")::float AS "minM",
           count(DISTINCT "rawData"->'properties'->'categories'->>0)::int AS cats
    FROM "BusinessNearby"
    GROUP BY "towerId"`;

export const BUSINESS_FEATURES_FOR_IDS_SQL = `
    SELECT "towerId"::int AS "towerId",
           count(*)::int AS n,
           count(*) FILTER (WHERE "distance" <= 150)::int AS n150,
           count(*) FILTER (WHERE "distance" <= 400)::int AS n400,
           min("distance")::float AS "minM",
           count(DISTINCT "rawData"->'properties'->'categories'->>0)::int AS cats
    FROM "BusinessNearby"
    WHERE "towerId" = ANY($1::int[])
    GROUP BY "towerId"`;

export interface FeatureTower {
    id: number;
    lat: number;
    lon: number;
    source: string;
    businessCount: number | null;
    avgBusinessDistance: number | null;
}

export interface TowerContext {
    cells: Map<string, { id: number; lat: number; lon: number }[]>;
    business: Map<number, BusinessAggregate>;
    registry?: RegistryIndex;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/** Spatial index over the full tower population. */
export function buildTowerContext(
    towers: { id: number; lat: number; lon: number }[],
    business: BusinessAggregate[] = [],
    registry?: RegistryIndex
): TowerContext {
    const cells = new Map<string, { id: number; lat: number; lon: number }[]>();
    for (const t of towers) {
        const cell = latLngToCell(t.lat, t.lon, H3_RES);
        const list = cells.get(cell) ?? [];
        list.push(t);
        cells.set(cell, list);
    }
    return { cells, business: new Map(business.map(b => [b.towerId, b])), registry };
}

function nearestOtherTowerM(ctx: TowerContext, lat: number, lon: number, selfId: number): number {
    const origin = latLngToCell(lat, lon, H3_RES);
    let best: number | null = null;
    for (let k = 0; k <= MAX_RING; k++) {
        for (const cell of gridDisk(origin, k)) {
            for (const t of ctx.cells.get(cell) ?? []) {
                if (t.id === selfId) continue;
                const d = haversineM(lat, lon, t.lat, t.lon);
                if (best === null || d < best) best = d;
            }
        }
        if (best !== null && k >= 1) break;
    }
    return Math.min(best ?? NEAREST_CAP_M, NEAREST_CAP_M);
}

function towersInOneRing(ctx: TowerContext, lat: number, lon: number, selfId: number): number {
    const origin = latLngToCell(lat, lon, H3_RES);
    let count = 0;
    for (const cell of gridDisk(origin, 1)) {
        for (const t of ctx.cells.get(cell) ?? []) {
            if (t.id !== selfId) count++;
        }
    }
    return count;
}

/** Returns the numeric feature vector in FEATURE_NAMES order. */
export function towerToFeatures(tower: FeatureTower, ctx: TowerContext): number[] {
    const nearest = nearestOtherTowerM(ctx, tower.lat, tower.lon, tower.id);
    const biz = ctx.business.get(tower.id);
    // A tower with no BusinessNearby rows is unmeasured, not empty.
    const n = biz ? Math.min(biz.n, 60) : BIZ_UNMEASURED;
    const n150 = biz ? Math.min(biz.n150, 6) : BIZ_UNMEASURED;
    const n400 = biz ? Math.min(biz.n400, 20) : BIZ_UNMEASURED;
    const nearestBiz = biz ? biz.minM : NEAREST_CAP_M;
    const cats = biz ? Math.min(biz.cats, 8) : BIZ_UNMEASURED;
    // Registry evidence, same sentinel convention: no cache rows in range is
    // unmeasured, not proof of absence.
    const reg = ctx.registry ? registryEvidenceFor(ctx.registry, tower.lat, tower.lon) : null;
    return [
        tower.businessCount ?? 0,
        tower.avgBusinessDistance !== null ? 1 : 0,
        Math.round((tower.avgBusinessDistance ?? 0) / 10) * 10,
        Math.round(Math.log1p(nearest) * 10) / 10,
        towersInOneRing(ctx, tower.lat, tower.lon, tower.id),
        n,
        n150,
        n400,
        Math.round(Math.log1p(nearestBiz) * 10) / 10,
        cats,
        // Registry evidence. A row with no registry cell in range is
        // unmeasured, not isolated: distinct sentinels, never zero.
        reg && reg.measured ? reg.within150 : REG_UNMEASURED,
        reg && reg.measured ? reg.within400 : REG_UNMEASURED,
        reg && reg.measured ? Math.round(Math.log1p(reg.nearestM) * 10) / 10 : Math.round(Math.log1p(NEAREST_CAP_M) * 10) / 10,
        reg?.heightM ?? -1,
    ];
}
