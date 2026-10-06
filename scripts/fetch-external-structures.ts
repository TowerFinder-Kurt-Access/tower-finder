/**
 * Fetches independent telecom-structure evidence and caches it locally.
 *
 * Why this exists: the tower classifier currently reads business density, tower
 * spacing, and region. None of those are evidence a tower exists. These two free
 * sources are the first real signal in the pipeline.
 *
 *   --source osm        OpenStreetMap via Overpass. Free, no key.
 *   --source opencellid OpenCellID via the per-area API. Needs OPENCELLID_API_KEY and
 *                       is limited to 1,000 requests/day.
 *   --csv <path>        OpenCellID country export instead (302.csv.gz = Canada). This
 *                       is the fast path: one file covers the whole country.
 *
 * Output lands in data/external/<source>.json as { fetchedAt, features: [{lat,lon,kind}] }.
 * Nothing is written to the database here: the point is to measure whether the signal
 * improves held-out AUC before paying for a schema change.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/fetch-external-structures.ts --source osm
 *   npx tsx --env-file=.env scripts/fetch-external-structures.ts --source opencellid --limit 200
 */
import { latLngToCell, cellToBoundary } from 'h3-js';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Must identify the caller; Overpass blocks generic agents. */
const USER_AGENT = 'tower-finder/1.0 (tower database admin tool)';
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

/** Grouping resolution: H3 res 5 cells are ~10 km across, a sensible Overpass unit. */
const GRID_RES = 5;
/** Telemetry bboxes per Overpass request. Overpass gets slow well before this. */
const BATCH = 12;

interface Feature { lat: number; lon: number; kind: string }

/** Stable identity so a re-fetch updates instead of duplicating. */
function key(f: Feature): string {
    return `${f.lat.toFixed(4)},${f.lon.toFixed(4)},${f.kind}`;
}

function arg(name: string, fallback?: string): string {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : (fallback ?? '');
}

/** Cache and cursor files are written by a long-running job, so a truncated or
 *  hand-edited file must degrade to "start over" rather than crash the run. */
function readJsonSafe<T>(file: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
        return fallback;
    }
}

async function save(source: string, features: Feature[]): Promise<string> {
    const dir = path.join(process.cwd(), 'data', 'external');
    fs.mkdirSync(dir, { recursive: true });
    const deduped = Array.from(new Map(features.map(f => [key(f), f])).values());
    const file = path.join(dir, `${source}.json`);
    fs.writeFileSync(file, JSON.stringify({
        fetchedAt: new Date().toISOString(),
        count: deduped.length,
        features: deduped,
    }), 'utf8');
    return file;
}

/**
 * True only for structures explicitly tagged as telecom.
 *
 * OSM tag matches are far wider than they look. Over Canadian grid cells, a
 * man_made~"^(tower|mast)$" query returned 1,167 hits of which exactly ONE carried a
 * telecom tag: the rest are water towers, observation towers, fire towers and silos.
 * `man_made=tower` alone is therefore NOT evidence of a cell site, and feeding it to the
 * model would teach it that a water tower looks like a mast. Only these count:
 *   tower:type=communication | type=communications_tower | any communication:* key
 */
function isTelecom(tags: Record<string, string>): boolean {
    if (tags.tower_type === 'communication') return true;
    if (tags.type === 'communications_tower') return true;
    return Object.keys(tags).some(k => k.startsWith('communication:'));
}

function telecomKind(tags: Record<string, string>): string {
    if (tags.tower_type === 'communication') return 'tower:communication';
    if (tags.type === 'communications_tower') return 'type:communications_tower';
    const commKey = Object.keys(tags).find(k => k.startsWith('communication:'));
    return commKey ? commKey : 'telecom';
}

async function overpass(bbox: [number, number, number, number][]): Promise<any> {
    // man_made=lighting is deliberately NOT queried. It matches thousands of street
    // lights per box, which is what makes these queries time out, and a street light
    // is never a telecom structure.
    const filters = bbox.map(([s, w, n, e]) => `nwr["man_made"~"^(tower|mast|antenna)$"](${s},${w},${n},${e});
      nwr["tower:type"](${s},${w},${n},${e});`).join('\n');
    const query = `[out:json][timeout:180];(\n${filters}\n);out center tags;`;

    let last = '';
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
                body: new URLSearchParams({ data: query }).toString(),
            });
            if (!res.ok) { last = `${endpoint} -> ${res.status}`; continue; }
            return await res.json();
        } catch (e) {
            last = `${endpoint} -> ${(e as Error).message}`;
        }
    }
    throw new Error(`overpass failed: ${last}`);
}

/** Bounding boxes of every H3 res-5 cell that holds at least one candidate tower. */
async function gridBoxes(): Promise<[number, number, number, number][]> {
    const towers = await prisma.tower.findMany({
        where: { aiTowerScore: { not: null } },
        select: { lat: true, lon: true },
    });
    const cells = new Set(towers.map(t => latLngToCell(t.lat, t.lon, GRID_RES)));
    console.log(`candidate towers: ${towers.length} | grid cells: ${cells.size}`);
    return Array.from(cells).map(c => {
        const b = cellToBoundary(c) as [number, number][];
        return [
            Math.min(...b.map(p => p[0])), Math.min(...b.map(p => p[1])),
            Math.max(...b.map(p => p[0])), Math.max(...b.map(p => p[1])),
        ];
    });
}

async function fetchOsm() {
    const boxes = await gridBoxes();
    const dir = path.join(process.cwd(), 'data', 'external');
    fs.mkdirSync(dir, { recursive: true });
    const cacheFile = path.join(dir, 'osm.partial.json');
    const cursorFile = path.join(dir, 'osm.cursor');
    // A full sweep is thousands of Overpass requests over hours, so progress is
    // checkpointed every batch: the run resumes instead of restarting, and the cache is
    // usable for evaluation while the rest is still being fetched.
    let start = 0;
    let out: Feature[] = [];
    if (fs.existsSync(cursorFile)) {
        start = readJsonSafe<{ nextBox?: number }>(cursorFile, {}).nextBox ?? 0;
        if (fs.existsSync(cacheFile)) out = readJsonSafe<{ features?: Feature[] }>(cacheFile, {}).features ?? [];
        console.log(`resuming at box ${start} of ${boxes.length} with ${out.length} cached structures`);
    }
    let failed = 0;
    for (let i = start; i < boxes.length; i += BATCH) {
        const chunk = boxes.slice(i, i + BATCH);
        try {
            const data = await overpass(chunk);
            for (const el of data.elements || []) {
                const tags = el.tags || {};
                if (!isTelecom(tags)) continue;
                const lat = el.lat ?? el.center?.lat;
                const lon = el.lon ?? el.center?.lon;
                if (typeof lat !== 'number' || typeof lon !== 'number') continue;
                out.push({ lat, lon, kind: telecomKind(tags) });
            }
        } catch (e) {
            failed++;
            console.error(`  batch ${i / BATCH} failed: ${(e as Error).message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
        fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: new Date().toISOString(), count: out.length, features: out }));
        fs.writeFileSync(cursorFile, JSON.stringify({ nextBox: Math.min(i + BATCH, boxes.length) }));
        if ((i / BATCH) % 5 === 0) {
            console.log(`  ${i + chunk.length}/${boxes.length} boxes, ${out.length} telecom structures`);
        }
    }
    const file = await save('osm', out);
    fs.rmSync(cacheFile, { force: true });
    fs.rmSync(cursorFile, { force: true });
    const kinds: Record<string, number> = {};
    for (const f of out) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    console.log(`osm: ${out.length} telecom structures from ${boxes.length} boxes (${failed} failed batches)`);
    console.log('kinds:', JSON.stringify(Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 12))));
    console.log(`written to ${file}`);
}

async function fetchOpenCellIdFromCsv(file: string): Promise<void> {
    // OpenCellID country export: radio,mcc,net,area,cell,unit,lon,lat,range,samples,...
    const zlib = await import('zlib');
    const raw = fs.readFileSync(file);
    const csv = file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    const out: Feature[] = [];
    for (const line of csv.split('\n')) {
        if (!line) continue;
        const c = line.split(',');
        const lat = Number(c[7]), lon = Number(c[6]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        out.push({ lat, lon, kind: `cell:${c[0] ?? '?'}` });
    }
    const saved = await save('opencellid', out);
    const kinds: Record<string, number> = {};
    for (const f of out) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    console.log(`open cellid csv: ${out.length} cells from ${file}`);
    console.log('radios:', JSON.stringify(Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8))));
    console.log(`written to ${saved}`);
}

async function fetchOpenCellId() {
    const token = process.env.OPENCELLID_API_KEY;
    if (!token) throw new Error('OPENCELLID_API_KEY is not set');

    const limit = Number(arg('--limit', '900'));
    const boxes = await gridBoxes();

    // OpenCellID caps BBOX at 4,000,000 m^2 (~2km x 2km) and 1,000 credits/day, so the
    // grid cells are subdivided and the cursor is persisted to make this resumable.
    const cursorFile = path.join(process.cwd(), 'data', 'external', 'opencellid.cursor');
    fs.mkdirSync(path.dirname(cursorFile), { recursive: true });
    let cursor = 0;
    if (fs.existsSync(cursorFile)) cursor = readJsonSafe<{ nextTile?: number }>(cursorFile, {}).nextTile ?? 0;
    console.log(`open cellid: resuming at tile ${cursor} of ${boxes.length} (budget ${limit} credits)`);

    const SUB = 3; // each res-5 cell becomes 9 sub-tiles, all inside the 4e6 m2 cap
    const tiles: [number, number, number, number][] = [];
    for (const [s, w, n, e] of boxes) {
        const dLat = (n - s) / SUB, dLon = (e - w) / SUB;
        for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
            tiles.push([s + a * dLat, w + b * dLon, s + (a + 1) * dLat, w + (b + 1) * dLon]);
        }
    }

    const out: Feature[] = [];
    let spent = 0;
    for (let i = cursor; i < tiles.length && spent < limit; i++) {
        const [s, w, n, e] = tiles[i];
        const bbox = `${s},${w},${n},${e}`;
        try {
            const res = await fetch(
                `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}&BBOX=${bbox}&limit=200&format=json`,
            );
            if (!res.ok) { console.error(`  tile ${i} -> ${res.status}`); continue; }
            const data: any = await res.json();
            for (const c of data.cells || []) {
                if (typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
                out.push({ lat: c.lat, lon: c.lon, kind: `cell:${c.radio ?? '?'}` });
            }
            spent++;
        } catch (e) {
            console.error(`  tile ${i} failed: ${(e as Error).message}`);
        }
        if (spent % 50 === 0) {
            fs.writeFileSync(cursorFile, JSON.stringify({ nextTile: i + 1, spentAt: new Date().toISOString() }));
            console.log(`  ${spent} credits spent, ${out.length} cells, next tile ${i + 1}`);
            await new Promise(r => setTimeout(r, 250));
        }
    }
    fs.writeFileSync(cursorFile, JSON.stringify({ nextTile: cursor + spent, spentAt: new Date().toISOString() }));

    const existingFile = path.join(process.cwd(), 'data', 'external', 'opencellid.json');
    const existing = fs.existsSync(existingFile)
        ? readJsonSafe<{ features?: Feature[] }>(existingFile, {}).features ?? []
        : [];
    const file = await save('opencellid', [...existing, ...out]);
    console.log(`open cellid: ${out.length} new cells (${spent} credits) -> ${file}`);
}

async function main() {
    const source = arg('--source', 'osm');
    const csv = arg('--csv');
    if (csv) {
        if (!fs.existsSync(csv)) throw new Error(`csv not found: ${csv}`);
        await fetchOpenCellIdFromCsv(csv);
    } else if (source === 'osm') await fetchOsm();
    else if (source === 'opencellid') await fetchOpenCellId();
    else throw new Error(`unknown source "${source}" (expected osm or opencellid)`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());