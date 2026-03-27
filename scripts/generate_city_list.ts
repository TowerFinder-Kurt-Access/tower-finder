import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const ODA_DIR = 'sources/addresses data';
const OUTPUT_FILE = 'src/lib/canadian_cities.json';

async function main() {
    const files = fs.readdirSync(ODA_DIR).filter(f => f.startsWith('ODA_') && f.endsWith('.csv'));
    const cityMap: Record<string, Set<string>> = {};

    for (const file of files) {
        const provinceCode = file.split('_')[1];
        console.log(`Processing ${file} (${provinceCode})...`);
        
        const filePath = path.join(ODA_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        if (!cityMap[provinceCode]) cityMap[provinceCode] = new Set();

        for (const record of records) {
            if (record.csdname) {
                cityMap[provinceCode].add(record.csdname);
            }
            if (record.city && record.city.length > 2) {
                cityMap[provinceCode].add(record.city);
            }
        }
    }

    const finalOutput: Record<string, string[]> = {};
    for (const [province, cities] of Object.entries(cityMap)) {
        finalOutput[province] = Array.from(cities).sort();
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
    console.log(`Saved official city list to ${OUTPUT_FILE}`);
}

// Note: This script might be too slow/memory intensive for large CSVs in one go.
// For the agent, I'll provide a simplified version or a pre-populated list if needed.
// main();
