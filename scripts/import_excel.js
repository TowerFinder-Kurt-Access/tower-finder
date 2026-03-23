require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(process.cwd(), 'East Coast (PEI, NB, NFLD)_Jan27.xlsx');
    console.log(`Reading file from: ${filePath}`);

    const workbook = xlsx.readFile(filePath);
    console.log(`Sheets found: ${workbook.SheetNames.join(', ')}`);

    for (const sheetName of workbook.SheetNames) {
        console.log(`\nProcessing sheet: ${sheetName}...`);
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        console.log(`Found ${data.length} records in ${sheetName}.`);

        let count = 0;
        for (const row of data) {
            const lat = parseFloat(row['latitude']);
            const lon = parseFloat(row['longitude']);
            const licensee = row['LICENSEE'] || 'Unknown';
            const address = row['civic_address'] || '';
            const type = row['Struture Type'] || 'Unknown';
            const googleMapsUrl = row['google_map'] || '';

            if (isNaN(lat) || isNaN(lon)) {
                continue;
            }

            try {
                // Upsert Tower directly
                const tower = await prisma.tower.upsert({
                    where: {
                        lat_lon: { lat, lon }
                    },
                    update: {
                        googleMapsUrl: googleMapsUrl,
                        rawImportData: row
                    },
                    create: {
                        lat,
                        lon,
                        googleMapsUrl,
                        rawImportData: row
                    }
                });

                if (address) {
                    const existingParcel = await prisma.parcel.findUnique({
                        where: { towerId: tower.id }
                    });

                    if (!existingParcel) {
                        await prisma.parcel.create({
                            data: {
                                address: address,
                                towerId: tower.id,
                            }
                        });
                    }
                }
                count++;
                if (count % 50 === 0) process.stdout.write('.');
            } catch (e) {
                console.error(`\nFailed to import row:`, e);
            }
        }
        console.log(`\nFinished processing ${sheetName}. Imported/Updated ${count} records.`);
    }

    console.log('\nAll sheets import completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
