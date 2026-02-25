const xlsx = require('xlsx');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const filePath = path.join(__dirname, '../sources/5. Ontario_Jan12   Feb 24.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Read data as an array of arrays
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    console.log(`Found ${data.length - 1} rows of data (excluding header)`);

    let matchCount = 0;
    let updateCount = 0;

    // Start from index 1 to skip header
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const latRaw = row[0];
        const lonRaw = row[1];

        // Column H is index 7, Column I is index 8, Column J is index 9
        const colH = row[7];
        const colI = row[8];
        const colJ = row[9];

        if (!latRaw || !lonRaw) continue;

        // Only process if there's an actual note to add
        if (!colH && !colI && !colJ) continue;

        const lat = parseFloat(latRaw);
        const lon = parseFloat(lonRaw);

        if (isNaN(lat) || isNaN(lon)) continue;

        const notesToCreate = [];

        if (colH) {
            const text = colH.toString().trim();
            if (text) notesToCreate.push({ content: text });
        }

        if (colI) {
            const text = colI.toString().trim();
            if (text) notesToCreate.push({ content: text });
        }

        if (colJ) {
            const text = colJ.toString().trim();
            if (text) notesToCreate.push({ content: text });
        }

        if (notesToCreate.length === 0) continue;

        try {
            // Find the tower
            const tower = await prisma.tower.findUnique({
                where: {
                    lat_lon: {
                        lat: lat,
                        lon: lon
                    }
                }
            });

            if (tower) {
                matchCount++;

                // Delete existing notes for this tower
                await prisma.note.deleteMany({
                    where: {
                        towerId: tower.id
                    }
                });

                // Add the new notes
                for (const noteData of notesToCreate) {
                    await prisma.note.create({
                        data: {
                            content: noteData.content,
                            towerId: tower.id,
                        }
                    });
                }

                updateCount++;
            }
        } catch (e) {
            console.error(`Error processing tower at lat ${lat}, lon ${lon}:`, e);
        }
    }

    console.log(`Finished import. Matched ${matchCount} towers. Updated notes for ${updateCount} towers.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
