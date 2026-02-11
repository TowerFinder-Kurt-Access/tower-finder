const fs = require('fs');
const path = require('path');
const { parse } = require('../sources/oda-importer/node_modules/csv-parse');

const ODA_DIR = path.join(__dirname, '..', 'sources', 'addresses data');

async function analyzeFile(provinceCode) {
    const csvPath = path.join(ODA_DIR, `ODA_${provinceCode}_v1.csv`);
    if (!fs.existsSync(csvPath)) {
        console.error(`File not found: ${csvPath}`);
        return;
    }

    console.log(`Analyzing ${provinceCode}...`);
    const parser = fs.createReadStream(csvPath).pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
    }));

    const distinctCities = new Set();
    const distinctStreets = new Set();
    const distinctPostalCodes = new Set();
    let rowCount = 0;

    for await (const row of parser) {
        rowCount++;
        if (row.city) distinctCities.add(row.city.toUpperCase());
        // Street unique key: Name + Type + Dir
        const streetKey = `${row.str_name || ''}|${row.str_type || ''}|${row.str_dir || ''}`;
        if (streetKey !== '||') distinctStreets.add(streetKey);
        if (row.postal_code) distinctPostalCodes.add(row.postal_code);

        if (rowCount % 100000 === 0) process.stdout.write('.');
    }

    console.log(`\n\nResults for ${provinceCode}:`);
    console.log(`Total Rows: ${rowCount.toLocaleString()}`);
    console.log(`Unique Cities: ${distinctCities.size.toLocaleString()}`);
    console.log(`Unique Streets: ${distinctStreets.size.toLocaleString()}`);
    console.log(`Unique Postal Codes: ${distinctPostalCodes.size.toLocaleString()}`);
    console.log('-----------------------------------');
}

async function main() {
    // Analyze PE (small) and maybe MB or NS (medium)
    // Avoid ON/QC/BC for now due to time/memory, unless requested
    await analyzeFile('PE');
    await analyzeFile('NS');
}

main().catch(console.error);
