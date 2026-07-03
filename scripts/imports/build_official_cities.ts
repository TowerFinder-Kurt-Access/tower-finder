/**
 * Build the authoritative lists of official municipality and county names per
 * province from the Statistics Canada Standard Geographical Classification (SGC)
 * 2021 structure file. The 7-digit code begins with the 2-digit province code, and
 * "Class title" is the official name.
 *   - Level 4 = Census Subdivision (municipality)  -> canadian_cities.json
 *   - Level 3 = Census Division (county / regional district / MRC) -> canadian_counties.json
 *
 * Source (already downloaded to sources/sgc-2021-structure.csv):
 *   https://www.statcan.gc.ca/eng/statistical-programs/document/sgc-cgt-2021-structure-eng.csv
 *
 *   npx tsx scripts/imports/build_official_cities.ts
 */
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const SGC_FILE = 'sources/sgc-2021-structure.csv';
const CITIES_FILE = 'src/lib/canadian_cities.json';
const COUNTIES_FILE = 'src/lib/canadian_counties.json';

// SGC province/territory (PR) code -> 2-letter code.
const PRUID_TO_CODE: Record<string, string> = {
    '10': 'NL', '11': 'PE', '12': 'NS', '13': 'NB', '24': 'QC', '35': 'ON',
    '46': 'MB', '47': 'SK', '48': 'AB', '59': 'BC', '60': 'YT', '61': 'NT', '62': 'NU',
};

function collect(rows: Record<string, string>[], level: string): Record<string, string[]> {
    const byProvince: Record<string, Set<string>> = {};
    for (const r of rows) {
        if (r['Level'] !== level) continue;
        const code = r['Code'];
        const name = r['Class title'];
        if (!code || !name) continue;
        const prov = PRUID_TO_CODE[code.slice(0, 2)];
        if (!prov) continue;
        (byProvince[prov] ??= new Set()).add(name);
    }
    const out: Record<string, string[]> = {};
    for (const [prov, names] of Object.entries(byProvince)) {
        out[prov] = Array.from(names).sort((a, b) => a.localeCompare(b));
    }
    return out;
}

function write(file: string, data: Record<string, string[]>, label: string) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const total = Object.values(data).reduce((n, a) => n + a.length, 0);
    console.log(`Wrote ${file}: ${Object.keys(data).length} provinces, ${total} official ${label}.`);
    for (const p of Object.keys(data).sort()) console.log(`  ${p}: ${data[p].length}`);
}

function main() {
    const rows = parse(fs.readFileSync(SGC_FILE, 'utf-8'), {
        columns: true, skip_empty_lines: true, trim: true,
    }) as Record<string, string>[];

    write(CITIES_FILE, collect(rows, '4'), 'municipalities');
    write(COUNTIES_FILE, collect(rows, '3'), 'counties (census divisions)');
}

main();
