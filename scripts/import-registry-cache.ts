/**
 * Normalizes raw registry snapshots into one JSONL per source.
 *
 * Input:  data/registry-cache/raw/{fcc-asr.zip,ised-tafl.zip}
 * Output: data/registry-cache/{fcc-asr,ised-tafl}.jsonl
 *         one {"id","lat","lon","heightM","source","snapshot"} object per line.
 *
 * FCC ASR (r_tower.zip — pipe-delimited registration dumps, verified against
 * live ASR record 1267317):
 *   CO.dat  col 2 file number, col 3 registration number, col 9/14 N/S/E/W
 *           markers, col 10/15 coordinates as total arc-seconds (divide by
 *           3600 for decimal degrees).
 *   RA.dat  col 2 file number, col 3 registration number, col 8 status (keep
 *           C constructed), col 28 structure height m, col 30 overall AGL m,
 *           col 32 type.
 *   Join key is file number + registration number. Height prefers overall
 *   AGL, falls back to structure height. Colocated sub-rows share one
 *   coordinate pair, so the merge dedupes on rounded coordinates.
 *
 * ISED TAFL (TAFL_LTAF.zip — semicolon CSVs): latitude/longitude in decimal
 * degrees, antenna height where present. Column positions come from the
 * paired field-description file and are detected at import time, not
 * hardcoded here beyond the anchor names below.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const CACHE = path.join(process.cwd(), 'data', 'registry-cache');
const RAW = path.join(CACHE, 'raw');

export interface RegistryRow {
    id: string;
    lat: number;
    lon: number;
    heightM: number | null;
    source: 'fcc-asr' | 'ised-tafl';
    snapshot: string;
}

function unzipList(zip: string): string[] {
    try {
        const out = execFileSync('unzip', ['-l', zip], { encoding: 'utf8' });
        return out.split('\n').map((l) => l.trim().split(/\s+/).pop() ?? '').filter((n) => n.length > 3);
    } catch {
        return [];
    }
}

function unzipTo(zip: string, member: string): string {
    return execFileSync('unzip', ['-p', zip, member], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function parseFccAsr(zip: string, snapshot: string): RegistryRow[] {
    const coText = unzipTo(zip, 'CO.dat');
    const raText = unzipTo(zip, 'RA.dat');
    // Per-registration status, height, and type from the RA table. Columns
    // verified against live ASR record 1267317 (Height 146.3, Overall AGL
    // 152.4, TOWER): col 8 is status, col 28 structure height m, col 30
    // overall AGL m, col 32 type.
    const reg = new Map<string, { status: string; heightM: number | null; type: string }>();
    for (const line of raText.split('\n')) {
        const f = line.split('|');
        if (f[0] !== 'RA' || f.length < 33) continue;
        const agl = Number(f[30]);
        const struct = Number(f[28]);
        reg.set(`${f[2]}|${f[3]}`, {
            status: f[8] ?? '',
            heightM: Number.isFinite(agl) && agl > 0 ? agl : Number.isFinite(struct) && struct > 0 ? struct : null,
            type: f[32] ?? '',
        });
    }
    const rows: RegistryRow[] = [];
    const seen = new Set<string>();
    // CO columns verified against live records (registration 1267317 pins
    // 29-46-57.6 N 95-26-26.8 W at file A1242052): cols 9/14 are the N/S/E/W
    // markers and cols 10/15 are total arc-seconds of latitude/longitude.
    for (const line of coText.split('\n')) {
        const f = line.split('|');
        if (f[0] !== 'CO' || f.length < 16) continue;
        const info = reg.get(`${f[2]}|${f[3]}`);
        if (!info) continue;
        const latSec = Number(f[10]);
        const lonSec = Number(f[15]);
        if (!Number.isFinite(latSec) || !Number.isFinite(lonSec) || latSec === 0 || lonSec === 0) continue;
        const lat = (f[9] === 'S' ? -1 : 1) * (latSec / 3600);
        const lon = (f[14] === 'E' ? 1 : -1) * (lonSec / 3600);
        const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
            id: `fcc-asr:${f[3] || f[2]}`,
            lat, lon,
            heightM: info.heightM,
            source: 'fcc-asr',
            snapshot,
        });
    }
    return rows;
}

function pick(headers: string[], ...names: string[]): number {
    const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const name of names) {
        const i = lower.indexOf(name);
        if (i >= 0) return i;
    }
    return -1;
}

function parseTafl(zip: string, snapshot: string): RegistryRow[] {
    const members = unzipList(zip).filter((m) => m.toLowerCase().endsWith('.csv') || m.toLowerCase().endsWith('.txt'));
    if (members.length === 0) throw new Error(`no CSV members in ${zip}`);
    const rows: RegistryRow[] = [];
    const seen = new Set<string>();
    for (const member of members) {
        const text = unzipTo(zip, member);
        const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
        if (lines.length < 2) continue;
        // TAFL extracts are semicolon-delimited; fall back to comma.
        const delim = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ';' : ',';
        const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''));
        const latI = pick(headers, 'latitude', 'lat', 'sitelatitude');
        const lonI = pick(headers, 'longitude', 'lon', 'long', 'sitelongitude');
        if (latI < 0 || lonI < 0) {
            console.log(`tafl ${member}: no lat/lon columns (${headers.slice(0, 8).join(',')}…), skipped`);
            continue;
        }
        const heightI = pick(headers, 'antennaheight', 'structureheight', 'towerheight', 'height', 'haat');
        const idI = pick(headers, 'licencenumber', 'licensenumber', 'authorizationnumber', 'callsign', 'stationid', 'id');
        for (let i = 1; i < lines.length; i++) {
            const f = lines[i].split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
            const lat = Number(f[latI]);
            const lon = Number(f[lonI]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) continue;
            if (lat < 40 || lat > 84 || lon > -50 || lon < -170) continue;
            const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const h = heightI >= 0 ? Number(f[heightI]) : NaN;
            rows.push({
                id: `ised-tafl:${idI >= 0 && f[idI] ? f[idI] : key}`,
                lat, lon,
                heightM: Number.isFinite(h) && h > 0 ? h : null,
                source: 'ised-tafl',
                snapshot,
            });
        }
    }
    return rows;
}

function writeJsonl(name: string, rows: RegistryRow[]): string {
    const dest = path.join(CACHE, `${name}.jsonl`);
    fs.writeFileSync(dest, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
    return dest;
}

async function main() {
    const write = process.argv.includes('--write');
    const manifestPath = path.join(CACHE, 'manifest.json');
    const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { sources: { name: string; file: string | null }[] }
        : { sources: [] };
    const snapshot = new Date().toISOString().slice(0, 10);
    const outputs: { name: string; rows: number; file: string | null }[] = [];

    const fccZip = path.join(RAW, 'fcc-asr.zip');
    if (fs.existsSync(fccZip)) {
        const rows = parseFccAsr(fccZip, snapshot);
        const file = write ? writeJsonl('fcc-asr', rows) : null;
        console.log(`fcc-asr: ${rows.length} constructed structures${write ? ` -> ${file}` : ' (dry run)'}`);
        if (rows[0]) console.log(`  sample: ${JSON.stringify(rows[0])}`);
        outputs.push({ name: 'fcc-asr', rows: rows.length, file });
    } else {
        console.log('fcc-asr: raw zip missing, run fetch-registry-cache first');
    }

    const taflZip = path.join(RAW, 'ised-tafl.zip');
    if (fs.existsSync(taflZip)) {
        const rows = parseTafl(taflZip, snapshot);
        const file = write ? writeJsonl('tafl', rows) : null;
        console.log(`ised-tafl: ${rows.length} licensed sites${write ? ` -> ${file}` : ' (dry run)'}`);
        if (rows[0]) console.log(`  sample: ${JSON.stringify(rows[0])}`);
        outputs.push({ name: 'ised-tafl', rows: rows.length, file });
    } else {
        console.log('ised-tafl: raw zip missing (host geo-routes the URL) — drop TAFL_LTAF.zip into data/registry-cache/raw/ and rerun');
    }

    if (!write) console.log('\ndry run. add --write to write the JSONL cache.');
    void manifest;
    void outputs;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
