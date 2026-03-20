
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function rawStats() {
    try {
        console.log('Fetching missing geometry stats per source...');
        const missingGeoBySource = await prisma.$queryRaw`
            SELECT "dataSource", COUNT(*) as count 
            FROM "Parcel" 
            WHERE geometry IS NULL 
            GROUP BY "dataSource"
        `;

        console.log('--- Missing Geometry Counts ---');
        console.table(missingGeoBySource);

        const totalBySource = await prisma.$queryRaw`
            SELECT "dataSource", COUNT(*) as count 
            FROM "Parcel" 
            GROUP BY "dataSource"
        `;

        console.log('--- Total Counts ---');
        console.table(totalBySource);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

rawStats();
