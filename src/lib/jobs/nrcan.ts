import { prisma } from '@/lib/prisma';
import { NRCanService } from '@/services/NRCanService';
import { enqueueJob } from '@/lib/job-queue';

export async function processNRCanBatch(params: any): Promise<any> {
    const towers = await prisma.tower.findMany({
        where: { parcelProcessedAt: null },
        take: 50,
        select: { id: true, lat: true, lon: true }
    });

    if (towers.length === 0) {
        return { message: 'No towers to process for parcels' };
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const tower of towers) {
        try {
            const feature = await NRCanService.fetchParcel(tower.lat, tower.lon);

            if (feature) {
                const attributes = feature.attributes || {};
                const geometry = feature.geometry || null;

                await prisma.parcel.upsert({
                    where: { towerId: tower.id },
                    update: {
                        parcelId: attributes.PIN || attributes.planNumber || null,
                        rawData: attributes,
                        geometry: geometry,
                        dataSource: 'NRCan'
                    },
                    create: {
                        towerId: tower.id,
                        parcelId: attributes.PIN || attributes.planNumber || null,
                        rawData: attributes,
                        geometry: geometry,
                        dataSource: 'NRCan'
                    }
                });
            }

            // Always update the tower, even if no parcel found, so we don't retry forever
            await prisma.tower.update({
                where: { id: tower.id },
                data: { parcelProcessedAt: new Date() }
            });

            processedCount++;

            // Sleep slightly to avoid spamming the API too fast
            await new Promise(resolve => setTimeout(resolve, 200));

        } catch (err) {
            console.error(`[NRCan Job] Error processing tower ${tower.id}:`, err);
            errorCount++;
            // We DO NOT update parcelProcessedAt on error, so it can be retried in the next run
            // or next job attempt if this job fails.
        }
    }

    const remainingCount = await prisma.tower.count({
        where: { parcelProcessedAt: null }
    });

    if (remainingCount > 0) {
        console.log(`[NRCan Job] ${remainingCount} towers remaining. Enqueueing next batch...`);
        // Using enqueueJob to queue the next batch
        await enqueueJob('process_nrcan_batch', {});
    }

    return {
        status: 'completed',
        processed: processedCount,
        errors: errorCount,
        remainingTowers: remainingCount
    };
}
