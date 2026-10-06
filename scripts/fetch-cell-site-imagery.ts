/**
 * Fetches real aerial imagery for cell sites that OpenCellID knows about and our tower
 * database does not, so a human can confirm whether a tower is really there.
 *
 * This is the human-in-the-loop version of tower detection. It reads the tower table
 * but writes nothing: no Prisma change, no migration, no new column. Output is a folder
 * of images plus a CSV index.
 *
 * Why the filtering matters, measured on this dataset:
 *   - cells with a large `range` have a position estimate hundreds of metres off, so the
 *     tile comes back empty. Probing them at face value hit 1 tower in 4.
 *   - filtering to range <= 600 m and samples >= 10 tightens the pool from 21,488 to 348
 *     candidate sites.
 *
 * A verified example: OpenCellID cell at 43.34010,-79.82150 (51 samples) has no tower
 * of ours within 250 m, and the imagery for it shows an unmistakable lattice tower.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/fetch-cell-site-imagery.ts \
 *     --csv "/path/to/302.csv.gz" [--min-samples 10] [--max-range 600] [--near 250] [--limit 40]
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { latLngToCell, gridDisk } from 'h3-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ZOOM = 19; // ~0.2-0.3 m per pixel: a mast is several pixels wide
/** A flat grey "no map data" tile compresses to about 2.5 KB; real imagery is 9 KB+. */
const MIN_TILE_BYTES = 5000;
const TILE_PAUSE_MS = 250;

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function haversine(a: number, b: number, c: number, d: number) {
    const R = 6371000, dLat = (c - a) * Math.PI / 180, dLon = (d - b) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function tileXY(lat: number, lon: number, z: number) {
    const n = 2 ** z;
    return {
        x: Math.floor((lon + 180) / 360 * n),
        y: Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n),
    };
}

interface Cell { lat: number; lon: number; samples: number; range: number; radio: string }

async function main() {
    const csvPath = arg('--csv', '');
    if (!csvPath || !fs.existsSync(csvPath)) {
        throw new Error('pass --csv <path to the OpenCellID country export>');
    }
    const minSamples = Number(arg('--min-samples', '10'));
    const maxRange = Number(arg('--max-range', '600'));
    const near = Number(arg('--near', '250'));
    const limit = Number(arg('--limit', '40'));

    const raw = fs.readFileSync(csvPath);
    const text = csvPath.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    // radio,mcc,net,area,cell,unit,lon,lat,range,samples,created,updated
    const cells: Cell[] = text.split('\n').filter(Boolean).map(l => {
        const c = l.split(',');
        return { lat: Number(c[7]), lon: Number(c[6]), samples: Number(c[9]) || 0, range: Number(c[8]) || 0, radio: c[0] };
    }).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));

    const towers = await prisma.tower.findMany({ select: { lat: true, lon: true } });
    const idx = new Map<string, { lat: number; lon: number }[]>();
    for (const t of towers) {
        const k = latLngToCell(t.lat, t.lon, 9);
        const l = idx.get(k) ?? [];
        l.push(t);
        idx.set(k, l);
    }
    const towerNear = (lat: number, lon: number, radius: number) => {
        const origin = latLngToCell(lat, lon, 9);
        for (const cell of gridDisk(origin, 2)) {
            for (const t of idx.get(cell) ?? []) if (haversine(lat, lon, t.lat, t.lon) <= radius) return true;
        }
        return false;
    };

    const pool = cells.filter(c => c.samples >= minSamples && c.range > 0 && c.range <= maxRange && !towerNear(c.lat, c.lon, near))
        .sort((a, b) => b.samples - a.samples);
    console.log(`cells total ${cells.length}`);
    console.log(`candidates: samples>=${minSamples}, range<=${maxRange}m, no tower within ${near}m -> ${pool.length}`);

    // Several cells usually share one mast, so group them into a single site.
    const sites: { lat: number; lon: number; cells: number; samples: number; range: number; radios: Set<string> }[] = [];
    for (const c of pool) {
        const hit = sites.find(s => haversine(c.lat, c.lon, s.lat, s.lon) <= 200);
        if (hit) {
            hit.cells++;
            hit.samples += c.samples;
            hit.radios.add(c.radio);
        } else {
            sites.push({ lat: c.lat, lon: c.lon, cells: 1, samples: c.samples, range: c.range, radios: new Set([c.radio]) });
        }
    }
    sites.sort((a, b) => b.samples - a.samples);
    console.log(`grouped into ${sites.length} sites; reviewing the top ${Math.min(limit, sites.length)}`);

    const outDir = path.join(process.cwd(), 'data', 'cell-site-imagery');
    fs.mkdirSync(outDir, { recursive: true });
    const rows = [['site', 'lat', 'lon', 'cells', 'samples', 'range_m', 'radios', 'imagery', 'image_file', 'verdict', 'notes'].join(',')];
    let withImagery = 0;

    for (let i = 0; i < Math.min(limit, sites.length); i++) {
        const s = sites[i];
        const { x, y } = tileXY(s.lat, s.lon, ZOOM);
        const file = path.join(outDir, `site-${String(i).padStart(3, '0')}.jpg`);
        let available = false, bytes = 0;
        try {
            const res = await fetch(
                `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${y}/${x}`,
                { headers: { 'User-Agent': 'tower-finder/1.0 (tower database admin tool)' } },
            );
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                bytes = buf.length;
                fs.writeFileSync(file, buf);
                available = bytes >= MIN_TILE_BYTES;
            }
        } catch {
            available = false;
        }
        if (available) withImagery++;
        rows.push([
            i, s.lat.toFixed(6), s.lon.toFixed(6), s.cells, s.samples, s.range,
            Array.from(s.radios).join('|'), available ? 'yes' : 'no',
            available ? path.relative(process.cwd(), file) : '', '', '',
        ].map(v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(','));
        await new Promise(r => setTimeout(r, TILE_PAUSE_MS));
    }

    const csvOut = path.join(process.cwd(), 'data', `cell-site-imagery-${new Date().toISOString().slice(0, 10)}.csv`);
    fs.writeFileSync(csvOut, `${rows.join('\n')}\n`, 'utf8');
    console.log(`\n${withImagery} of ${Math.min(limit, sites.length)} sites have usable imagery`);
    console.log(`images: ${outDir}`);
    console.log(`index:  ${csvOut}`);
    console.log('Open each image: a mast, guy wires or a shadow means a real structure. Fill the verdict column.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());