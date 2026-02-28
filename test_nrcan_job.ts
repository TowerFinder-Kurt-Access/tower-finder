import { prisma } from './src/lib/prisma';
import { processNRCanBatch } from './src/lib/job-handlers';

async function test() {
    console.log('Testing NRCan batch processing...');

    // Find a tower in Yukon/NWT if possible, or just some sample towers
    const sampleTowers = await prisma.tower.findMany({
        where: { parcelProcessedAt: null },
        take: 5
    });

    for (const tower of sampleTowers) {
        console.log(`Checking tower ${tower.id} at ${tower.lat}, ${tower.lon}`);
    }

    const result = await processNRCanBatch({});
    console.log('Result:', JSON.stringify(result, null, 2));

    const parcelCount = await prisma.parcel.count({
        where: { dataSource: 'NRCan' }
    });
    console.log(`Total NRCan parcels in DB: ${parcelCount}`);

    const sampleParcel = await prisma.parcel.findFirst({
        where: { dataSource: 'NRCan' },
        include: { tower: true }
    });

    if (sampleParcel) {
        console.log('Sample Parcel:', JSON.stringify(sampleParcel, null, 2));
    } else {
        console.log('No parcels found yet.');
    }
}

test().catch(console.error).finally(() => prisma.$disconnect());
