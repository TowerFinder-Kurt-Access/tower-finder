
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeMissingGeometry() {
    console.log('Counting parcels...');
    const totalParcelsCount = await prisma.parcel.count();
    console.log(`Total Parcels: ${totalParcelsCount}`);

    let processed = 0;
    const batchSize = 1000;
    const sourceStats: Record<string, { total: number, missingGeo: number }> = {};
    const samples: any[] = [];

    while (processed < totalParcelsCount) {
        console.log(`Processing batch ${processed} to ${processed + batchSize}...`);
        const batch = await prisma.parcel.findMany({
            skip: processed,
            take: batchSize,
            select: { id: true, geometry: true, dataSource: true, towerId: true, rawData: true }
        });

        for (const p of batch) {
            const source = p.dataSource || 'Unknown';
            if (!sourceStats[source]) {
                sourceStats[source] = { total: 0, missingGeo: 0 };
            }
            sourceStats[source].total++;
            if (!p.geometry) {
                sourceStats[source].missingGeo++;
                if (samples.length < 5) {
                    samples.push(p);
                }
            }
        }

        processed += batch.length;
        if (batch.length === 0) break;
    }

    console.log('--- Statistics by Data Source ---');
    console.table(Object.entries(sourceStats).map(([Source, Stats]) => ({
        Source,
        Total: Stats.total,
        'Missing Geo': Stats.missingGeo,
        'Missing %': ((Stats.missingGeo / Stats.total) * 100).toFixed(2) + '%'
    })));

    console.log('--- Samples without geometry ---');
    samples.forEach(s => {
        console.log(`ID: ${s.id}, Source: ${s.dataSource}, Tower: ${s.towerId}`);
        if (s.rawData) {
            console.log(`  RawData keys: ${Object.keys(s.rawData as any).join(', ')}`);
        }
    });

    await prisma.$disconnect();
}

analyzeMissingGeometry();
