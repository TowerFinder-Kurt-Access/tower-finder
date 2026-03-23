import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Backfill of rawImportData ---');
    const filePath = path.join(process.cwd(), 'sources', 'Marks Sheet new towers only 20260305.xlsx');
    
    try {
        console.log(`Reading Excel file from: ${filePath}`);
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(worksheet);

        console.log(`Found ${rows.length} rows in Excel file.`);
        let updatedCount = 0;
        let skippedCount = 0;

        for (const row of rows as any[]) {
            const lat = parseFloat(row['Latitude']);
            const lon = parseFloat(row['Longitude']);

            if (isNaN(lat) || isNaN(lon)) {
                skippedCount++;
                continue;
            }

            // Find matching tower by lat/lon (unique constraint)
            const tower = await prisma.tower.findUnique({
                where: {
                    lat_lon: { lat, lon }
                }
            });

            if (tower) {
                await prisma.tower.update({
                    where: { id: tower.id },
                    data: {
                        rawImportData: row
                    }
                });
                updatedCount++;
                if (updatedCount % 100 === 0) {
                    console.log(`Progress: Updated ${updatedCount} towers...`);
                }
            } else {
                skippedCount++;
            }
        }

        console.log(`--- Backfill Complete ---`);
        console.log(`Updated: ${updatedCount}`);
        console.log(`Skipped: ${skippedCount} (either not in DB or missing coordinates)`);

    } catch (error) {
        console.error('Error during backfill:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
