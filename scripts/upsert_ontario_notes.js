require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(process.cwd(), 'sources', '5. Ontario_Jan12_new.xlsx');
    console.log(`Reading file from: ${filePath}`);

    const workbook = xlsx.readFile(filePath);
    console.log(`Sheets found: ${workbook.SheetNames.join(', ')}`);

    let totalUpdated = 0;
    let totalNotesCreated = 0;
    let totalSkipped = 0;
    let totalNotFound = 0;

    for (const sheetName of workbook.SheetNames) {
        console.log(`\nProcessing sheet: ${sheetName}...`);
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        console.log(`Found ${data.length} records in ${sheetName}.`);

        for (const row of data) {
            const lat = parseFloat(row['latitude']);
            const lon = parseFloat(row['longitude']);
            const remarks = (row['Remarks'] || '').trim();

            if (isNaN(lat) || isNaN(lon)) {
                continue;
            }

            if (!remarks) {
                totalSkipped++;
                continue;
            }

            try {
                // Find the tower by lat/lon
                const tower = await prisma.tower.findFirst({
                    where: { lat, lon },
                    include: { notes: true }
                });

                if (!tower) {
                    totalNotFound++;
                    continue;
                }

                // Update the remarks field on the tower
                await prisma.tower.update({
                    where: { id: tower.id },
                    data: { remarks }
                });

                // Check if a note with this content already exists (avoid duplicates)
                const existingNote = tower.notes.find(n => n.content === remarks);
                if (!existingNote) {
                    await prisma.note.create({
                        data: {
                            towerId: tower.id,
                            content: remarks,
                            authorId: null // Imported from Excel, no user author
                        }
                    });
                    totalNotesCreated++;
                }

                totalUpdated++;
                if (totalUpdated % 50 === 0) process.stdout.write('.');
            } catch (e) {
                console.error(`\nFailed to update tower at (${lat}, ${lon}):`, e.message);
            }
        }
    }

    console.log(`\n\nDone!`);
    console.log(`  Towers updated (remarks): ${totalUpdated}`);
    console.log(`  Notes created: ${totalNotesCreated}`);
    console.log(`  Skipped (no remarks): ${totalSkipped}`);
    console.log(`  Not found in DB: ${totalNotFound}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
