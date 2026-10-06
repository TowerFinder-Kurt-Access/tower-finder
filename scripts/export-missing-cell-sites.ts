/**
 * Finds cell areas that OpenCellID knows about and our tower database does not.
 *
 * Measured result: OpenCellID CANNOT verify our existing towers — a well-sampled cell
 * within 250 m is right about 43% of the time, barely above the 39% base rate, and
 * adding the cell features to the model lowered AUC by 0.0035. Treating it as evidence
 * that a known tower is real does not work.
 *
 * What it IS good for is the opposite question: are there towers we are missing? This
 * groups the cells into H3 res-9 areas and exports every area that holds a meaningful
 * number of cells but has no tower within 250 m, so a reviewer can check it.
 *
 * A cell area is not a tower: several cells can share one site, and our own towers can
 * sit slightly outside the 250 m radius. Treat the output as places to look, not as
 * confirmed new sites.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/export-missing-cell-sites.ts \
 *     --csv "/path/to/302.csv.gz" [--min-cells 3] [--radius 250]
 */
import * as fs from 'fs';
import * as zlib from 'zlib';
import * as path from 'path';
import { latLngToCell, gridDisk } from 'h3-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RES = 9;

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function haversine(a: number, b: number, c: number, d: number) {
    const R = 6371000, dLat = (c - a) * Math.PI / 180, dLon = (d - b) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function csvCell(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
    const csvPath = arg('--csv', '');
    if (!csvPath || !fs.existsSync(csvPath)) {
        throw new Error('pass --csv <path to the OpenCellID country export>, e.g. --csv 302.csv.gz');
    }
    const minCells = Number(arg('--min-cells', '3'));
    const radius = Number(arg('--radius', '250'));

    const raw = fs.readFileSync(csvPath);
    const text = csvPath.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    // radio,mcc,net,area,cell,unit,lon,lat,range,samples,created,updated
    const cells = text.split('\n').filter(Boolean).map(l => {
        const c = l.split(',');
        return { lat: Number(c[7]), lon: Number(c[6]), samples: Number(c[9]) || 0 };
    }).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));
    console.log(`cells parsed: ${cells.length}`);

    const areas = new Map<string, { lat: number; lon: number; cells: number; samples: number }>();
    for (const c of cells) {
        const k = latLngToCell(c.lat, c.lon, RES);
        const cur = areas.get(k);
        if (cur) {
            cur.lat = (cur.lat * cur.cells + c.lat) / (cur.cells + 1);
            cur.lon = (cur.lon * cur.cells + c.lon) / (cur.cells + 1);
            cur.cells++;
            cur.samples += c.samples;
        } else {
            areas.set(k, { lat: c.lat, lon: c.lon, cells: 1, samples: c.samples });
        }
    }
    console.log(`cell areas: ${areas.size} (min cells per area: ${minCells})`);

    const towers = await prisma.tower.findMany({ select: { lat: true, lon: true } });
    const idx = new Map<string, { lat: number; lon: number }[]>();
    for (const t of towers) {
        const k = latLngToCell(t.lat, t.lon, RES);
        const l = idx.get(k) ?? [];
        l.push(t);
        idx.set(k, l);
    }
    const towerWithin = (lat: number, lon: number) => {
        const origin = latLngToCell(lat, lon, RES);
        for (const cell of gridDisk(origin, 2)) {
            for (const t of idx.get(cell) ?? []) if (haversine(lat, lon, t.lat, t.lon) <= radius) return true;
        }
        return false;
    };

    const pool = [...areas.values()].filter(a => a.cells >= minCells);
    const missing = pool.filter(a => !towerWithin(a.lat, a.lon))
        .sort((a, b) => b.cells - a.cells);

    const rows = [['cells_in_area', 'total_samples', 'lat', 'lon', 'radius_checked_m', 'satellite_url', 'notes'].join(',')];
    for (const m of missing) {
        rows.push([
            m.cells, m.samples, m.lat.toFixed(6), m.lon.toFixed(6), radius,
            `https://www.google.com/maps/@${m.lat.toFixed(5)},${m.lon.toFixed(5)},300m/data=!3m1!1e3`,
            '',
        ].map(csvCell).join(','));
    }

    const outDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `missing-cell-sites-${new Date().toISOString().slice(0, 10)}.csv`);
    fs.writeFileSync(outPath, `${rows.join('\n')}\n`, 'utf8');

    console.log(`\n${missing.length} of ${pool.length} cell areas have no tower within ${radius}m`);
    console.log(`written to ${outPath}`);
    console.log('Review the satellite links: some are our own towers slightly misplaced, some are new.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());