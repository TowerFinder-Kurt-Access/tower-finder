/**
 * Registry-structure evidence for the tower scorer.
 *
 * Reads the versioned JSONL cache written by
 * scripts/import-registry-cache.ts (data/registry-cache/*.jsonl) and answers
 * nearest-structure queries over an H3 index, mirroring features.ts.
 *
 * A tower with no registry structure in range is reported as unmeasured
 * (REG_UNMEASURED), the same way a tower with no BusinessNearby rows is
 * unmeasured rather than isolated.
 */
import * as fs from 'fs';
import * as path from 'path';
import { latLngToCell, gridDisk } from 'h3-js';

const H3_RES = 8; // ~461 m hex edge, same as features.ts
const MAX_RING = 4; // nearest-neighbor search horizon (~3.5 km)
const NEAREST_CAP_M = 5000;
export const REG_UNMEASURED = 99;

export interface RegistryStructure {
    lat: number;
    lon: number;
    heightM: number | null;
    source: string;
}

const CACHE = path.join(process.cwd(), 'data', 'registry-cache');

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/** One registry row per line; malformed lines are skipped, never fatal. */
export function loadRegistryStructures(dir = CACHE): RegistryStructure[] {
    const out: RegistryStructure[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.jsonl')) continue;
        for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
            if (!line.trim()) continue;
            try {
                const r = JSON.parse(line) as { lat?: unknown; lon?: unknown; heightM?: unknown; source?: unknown };
                if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
                out.push({
                    lat: r.lat,
                    lon: r.lon,
                    heightM: typeof r.heightM === 'number' && r.heightM > 0 ? r.heightM : null,
                    source: typeof r.source === 'string' ? r.source : file,
                });
            } catch {
                continue;
            }
        }
    }
    return out;
}

export interface RegistryIndex {
    cells: Map<string, RegistryStructure[]>;
}

/** Spatial index over cached registry structures. */
export function buildRegistryIndex(structures: RegistryStructure[]): RegistryIndex {
    const cells = new Map<string, RegistryStructure[]>();
    for (const s of structures) {
        const cell = latLngToCell(s.lat, s.lon, H3_RES);
        const list = cells.get(cell) ?? [];
        list.push(s);
        cells.set(cell, list);
    }
    return { cells };
}

export interface RegistryEvidence {
    nearestM: number;
    within150: number;
    within400: number;
    heightM: number | null;
    measured: boolean;
}

/** Nearest registry structure plus counts inside 150 m and 400 m. */
export function registryEvidenceFor(idx: RegistryIndex, lat: number, lon: number): RegistryEvidence {
    const origin = latLngToCell(lat, lon, H3_RES);
    let best: RegistryStructure | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    let within150 = 0;
    let within400 = 0;
    let measured = false;
    for (let k = 0; k <= MAX_RING; k++) {
        for (const cell of gridDisk(origin, k)) {
            const list = idx.cells.get(cell);
            if (!list) continue;
            measured = true;
            for (const s of list) {
                const d = haversineM(lat, lon, s.lat, s.lon);
                if (d <= 150) within150++;
                if (d <= 400) within400++;
                if (d < bestD) {
                    bestD = d;
                    best = s;
                }
            }
        }
        if (best !== null && k >= 1) break;
    }
    if (!measured) return { nearestM: NEAREST_CAP_M, within150: REG_UNMEASURED, within400: REG_UNMEASURED, heightM: null, measured: false };
    return {
        nearestM: Math.min(bestD, NEAREST_CAP_M),
        within150,
        within400,
        heightM: best?.heightM ?? null,
        measured: true,
    };
}
