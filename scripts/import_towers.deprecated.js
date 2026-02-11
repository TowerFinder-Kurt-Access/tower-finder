require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: node scripts/import_towers.js <path_to_excel_file>');
        process.exit(1);
    }

    const inputPath = args[0];
    const filePath = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);

    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found at ${filePath}`);
        process.exit(1);
    }

    console.log(`Reading file from: ${filePath}`);

    const fileName = path.basename(filePath);

    // Mapping for Filename -> State (if single state per file)
    const FILE_STATE_MAP = {
        'BC': 'BC',
        'British Columbia': 'BC',
        'Ontario': 'ON',
        'Alberta': 'AB',
        'Manitoba': 'MB',
        'Saskatchewan': 'SK',
        'Quebec': 'QC'
    };

    let fileDerivedState = null;
    for (const [key, val] of Object.entries(FILE_STATE_MAP)) {
        if (fileName.includes(key)) {
            fileDerivedState = val;
            break;
        }
    }

    const PROVINCE_REGEX = /\b(BC|AB|SK|MB|ON|QC|NB|NS|PE|PEI|NL|YT|NT|NU)\b/i;
    const PROVINCE_NORMALIZE = {
        'PEI': 'PE' // Normalize non-standard
    };

    const workbook = xlsx.readFile(filePath);
    console.log(`Sheets found: ${workbook.SheetNames.join(', ')}`);

    for (const sheetName of workbook.SheetNames) {
        console.log(`\nProcessing sheet: ${sheetName}...`);
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        console.log(`Found ${data.length} records in ${sheetName}.`);

        let count = 0;
        let skipped = 0;
        let errors = 0;

        const BATCH_SIZE = 50;
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const batch = data.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (row) => {
                // Flexible header matching
                const lat = parseFloat(row['latitude'] || row['Latitude'] || row['LATITUDE']);
                const lon = parseFloat(row['longitude'] || row['Longitude'] || row['LONGITUDE']);

                // Skip invalid coordinates
                if (isNaN(lat) || isNaN(lon)) {
                    skipped++;
                    return;
                }

                const licensee = row['LICENSEE'] || row['Licensee'] || 'Unknown';
                const address = row['civic_address'] || row['Address'] || '';
                const type = row['Struture Type'] || row['Structure Type'] || 'Unknown';
                const googleMapsUrl = row['google_map'] || '';

                // Determine State
                let state = fileDerivedState;
                if (!state && address) {
                    const match = address.match(PROVINCE_REGEX);
                    if (match) {
                        let code = match[1].toUpperCase();
                        if (PROVINCE_NORMALIZE[code]) code = PROVINCE_NORMALIZE[code];
                        state = code;
                    }
                }

                try {
                    // Upsert Tower
                    const tower = await prisma.tower.upsert({
                        where: {
                            lat_lon: { lat, lon }
                        },
                        update: {
                            licensee: licensee !== 'Unknown' ? licensee : undefined,
                            googleMapsUrl: googleMapsUrl || undefined,
                            type: type !== 'Unknown' ? type : undefined,
                            source: fileName // Update source to be filename
                        },
                        create: {
                            lat,
                            lon,
                            type,
                            status: 'New',
                            licensee,
                            googleMapsUrl,
                            source: fileName // Save filename as source
                        }
                    });

                    // Update or Create Parcel
                    if (address || state) {
                        const existingParcel = await prisma.parcel.findUnique({
                            where: { towerId: tower.id }
                        });

                        if (!existingParcel) {
                            await prisma.parcel.create({
                                data: {
                                    address: address,
                                    state: state, // Save parsed state
                                    towerId: tower.id,
                                    dataSource: 'Excel Import'
                                }
                            });
                        } else {
                            // Update state if missing
                            if (state && !existingParcel.state) {
                                await prisma.parcel.update({
                                    where: { id: existingParcel.id },
                                    data: { state: state }
                                });
                            }
                        }
                    }
                    count++;
                } catch (e) {
                    errors++;
                }
            }));
            process.stdout.write('.');
        }
        console.log(`\nFinished processing ${sheetName}. Success: ${count}, Skipped: ${skipped}, Errors: ${errors}`);
    }

    console.log('\nImport completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
