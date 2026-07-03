/**
 * Build the authoritative list of official municipality names per province from the
 * Statistics Canada Standard Geographical Classification (SGC) 2021 structure file.
 * Level-4 rows are Census Subdivisions (municipalities); the 7-digit code begins with
 * the 2-digit province code, and "Class title" is the official name.
 *
 * Source (already downloaded to sources/sgc-2021-structure.csv):
 *   https://www.statcan.gc.ca/eng/statistical-programs/document/sgc-cgt-2021-structure-eng.csv
 *
 * Output: src/lib/canadian_cities.json  { "ON": [...], "QC": [...], ... }
 *
 *   npx tsx scripts/imports/build_official_cities.ts
 */
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const SGC_FILE = 'sources/sgc-2021-structure.csv';
const OUTPUT_FILE = 'src/lib/canadian_cities.json';

// SGC province/territory (PR) code -> 2-letter code.
const PRUID_TO_CODE: Record<string, string> = {
    '10': 'NL', '11': 'PE', '12': 'NS', '13': 'NB', '24': 'QC', '35': 'ON',
    '46': 'MB', '47': 'SK', '48': 'AB', '59': 'BC', '60': 'YT', '61': 'NT', '62': 'NU',
};

function main() {
    const rows = parse(fs.readFileSync(SGC_FILE, 'utf-8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as Record<string, string>[];

    const byProvince: Record<string, Set<string>> = {};
    for (const r of rows) {
        if (r['Level'] !== '4') continue; // 4 = Census subdivision (municipality)
        const code = r['Code'];
        const name = r['Class title'];
        if (!code || !name) continue;
        const prov = PRUID_TO_CODE[code.slice(0, 2)];
        if (!prov) continue;
        (byProvince[prov] ??= new Set()).add(name);
    }

    const output: Record<string, string[]> = {};
    for (const [prov, names] of Object.entries(byProvince)) {
        output[prov] = Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    const total = Object.values(output).reduce((n, a) => n + a.length, 0);
    console.log(`Wrote ${OUTPUT_FILE}: ${Object.keys(output).length} provinces, ${total} official municipalities.`);
    for (const p of Object.keys(output).sort()) console.log(`  ${p}: ${output[p].length}`);
}

main();
