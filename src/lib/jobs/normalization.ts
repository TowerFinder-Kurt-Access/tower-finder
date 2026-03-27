import { prisma } from '@/lib/prisma';
import { LocationNormalizationService } from '@/services/LocationNormalizationService';
import { enqueueJob } from '@/lib/job-queue';

/**
 * Job handler to normalize locations for a batch of parcels.
 * Scans for rows where cityId, provinceId, or countyId is missing.
 */
export async function normalizeLocations(params: { batchSize?: number }): Promise<any> {
    const batchSize = params.batchSize || 50;
    
    console.log(`[Normalization Job] Starting batch normalization (size: ${batchSize})...`);

    // Find parcels that need normalization
    // We prioritize rows that haven't been processed at all
    const parcels = await prisma.parcel.findMany({
        where: {
            OR: [
                { cityId: null },
                { provinceId: null },
                { countyId: null }
            ]
        },
        take: batchSize,
        orderBy: { id: 'asc' }
    });

    if (parcels.length === 0) {
        console.log('[Normalization Job] No more parcels to normalize.');
        return { processed: 0, status: 'completed' };
    }

    let successCount = 0;
    let errorCount = 0;

    for (const parcel of parcels) {
        try {
            const result = await LocationNormalizationService.normalizeParcel(parcel.id);
            if (result) {
                successCount++;
            } else {
                // If normalization returned nothing, we still count it as "processed" 
                // but maybe we should flag it so we don't keep retrying forever?
                // For now, we'll just log it.
                errorCount++;
            }
        } catch (err) {
            errorCount++;
            console.error(`[Normalization Job] Error processing parcel ${parcel.id}:`, err);
        }
        
        // Brief delay between records if we suspect we are hitting external APIs
        // The service handles local vs remote logic.
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Normalization Job] Batch finished. Success: ${successCount}, Errors/Skipped: ${errorCount}`);

    // Check if there are more pending
    const remainingCount = await prisma.parcel.count({
        where: {
            OR: [
                { cityId: null },
                { provinceId: null },
                { countyId: null }
            ]
        }
    });

    if (remainingCount > 0) {
        console.log(`[Normalization Job] ${remainingCount} parcels remaining. Enqueueing next batch...`);
        await enqueueJob('normalize_locations', { batchSize });
    }

    return { 
        processed: parcels.length, 
        success: successCount, 
        errors: errorCount, 
        remaining: remainingCount 
    };
}
