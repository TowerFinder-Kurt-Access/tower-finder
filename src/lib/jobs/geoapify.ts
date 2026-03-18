import { prisma } from '@/lib/prisma';
import { GeoapifyService } from '@/services/GeoapifyService';
import { enqueueJob } from '@/lib/job-queue';

/**
 * Find towers that haven't been processed and submit a batch to Geoapify.
 */
export async function submitGeoapifyBatch(): Promise<any> {
    const towers = await prisma.tower.findMany({
        where: { placesProcessedAt: null },
        take: 100, // Process 100 at a time to stay safe within batch limits and timeouts
        select: { id: true, lat: true, lon: true }
    });

    if (towers.length === 0) {
        return { message: 'No towers to process' };
    }

    const batchId = await GeoapifyService.submitPlacesBatch(towers);

    // Schedule a poll job in 5 minutes
    await enqueueJob(
        'poll_geoapify_batch',
        { batchId, towerIds: towers.map(t => t.id) },
        new Date(Date.now() + 5 * 60 * 1000)
    );

    return { batchId, towerCount: towers.length };
}

/**
 * Poll for batch completion and process results.
 */
export async function pollGeoapifyBatch(params: { batchId: string, towerIds: number[] }): Promise<any> {
    const { batchId, towerIds } = params;

    const statusResult = await GeoapifyService.getBatchResult(batchId);

    if (statusResult.status === 'pending') {
        console.log(`[Geoapify Job] Batch ${batchId} still pending. Rescheduling poll...`);
        // Schedule a NEW poll job in 5 minutes
        await enqueueJob(
            'poll_geoapify_batch',
            params,
            new Date(Date.now() + 5 * 60 * 1000)
        );
        return { status: 'pending', batchId, message: 'Batch still pending, rescheduled' };
    }

    const batchData = statusResult.results || {};
    const resultsArray = batchData.results || [];
    let totalBusinesses = 0;

    for (let i = 0; i < towerIds.length; i++) {
        const towerId = towerIds[i];
        const towerResult = resultsArray[i];

        if (!towerResult || towerResult.error) {
            console.error(`[Geoapify Job] Error for tower ${towerId}:`, towerResult?.error);
            // Mark it as processed so we don't retry forever
            await prisma.tower.update({
                where: { id: towerId },
                data: { placesProcessedAt: new Date() }
            });
            continue;
        }

        const places = towerResult.result?.features || [];
        const businesses = places.map((place: any) => ({
            name: place.properties?.name || 'Unknown Business',
            // Cast phone to string as Geoapify sometimes returns it as a number
            phone: place.properties?.contact?.phone ? String(place.properties.contact.phone) : null,
            distance: place.properties?.distance || 0,
            rawData: place,
            towerId
        }));

        // Delete existing nearby businesses for this tower before adding new ones
        await prisma.businessNearby.deleteMany({ where: { towerId } });

        // Save new businesses
        if (businesses.length > 0) {
            await prisma.businessNearby.createMany({ data: businesses });
        }

        // Calculate summary stats
        const avgDistance = businesses.length > 0
            ? businesses.reduce((sum: number, b: any) => sum + b.distance, 0) / businesses.length
            : null;

        await prisma.tower.update({
            where: { id: towerId },
            data: {
                businessCount: businesses.length,
                avgBusinessDistance: avgDistance,
                placesProcessedAt: new Date()
            }
        });

        totalBusinesses += businesses.length;
    }

    // Check if there are more towers to process. 
    // If so, enqueue a NEW submission job to continue the cycle automatically.
    const remainingCount = await prisma.tower.count({
        where: { placesProcessedAt: null }
    });

    if (remainingCount > 0) {
        console.log(`[Geoapify Job] ${remainingCount} towers remaining. Enqueueing next batch...`);
        await enqueueJob('submit_geoapify_batch', {});
    }

    return {
        status: 'completed',
        towerCount: towerIds.length,
        businessCount: totalBusinesses,
        remainingTowers: remainingCount
    };
}
