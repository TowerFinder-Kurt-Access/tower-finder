import { prisma } from '@/lib/prisma';
import { TowerSearchService } from '@/services/TowerSearchService';
import { GeoapifyService } from '@/services/GeoapifyService';
import { enqueueJob } from '@/lib/job-queue';

/**
 * Registry of job type → handler function.
 * Each handler receives the job's `params` and returns a result object.
 * Throw an error to mark the job as failed (will retry if attempts remain).
 */
export const JOB_HANDLERS: Record<string, (params: any) => Promise<any>> = {
    'process_open_street_map_leads': processOSMLeads,
    'submit_geoapify_batch': submitGeoapifyBatch,
    'poll_geoapify_batch': pollGeoapifyBatch,
};

/**
 * Process OSM leads for a given country + city (optional).
 * Queries the Overpass API and upserts results into TowerLead.
 */
async function processOSMLeads(params: { country: string; province?: string; city?: string }): Promise<any> {
    const { country, province, city } = params;

    if (!country) {
        throw new Error('country is a required parameter');
    }

    console.log(`[OSM Job] Resolving bounds for ${city || 'Any City'}, ${province || ''}, ${country}...`);

    // Look up bounding box dynamically
    const bounds = await TowerSearchService.getBoundsForLocation(country, province, city);
    if (!bounds) {
        throw new Error(`Could not find bounding box for location: ${city || ''} ${province || ''} ${country}`);
    }

    console.log(`[OSM Job] Found bounds: ${JSON.stringify(bounds)}. Fetching leads...`);

    // Query OSM
    const osmResults = await TowerSearchService.searchInBounds(
        bounds.north, bounds.south, bounds.east, bounds.west
    );

    console.log(`[OSM Job] Got ${osmResults.length} results from OSM for ${city || 'Any City'}, ${country}`);

    // Upsert leads
    let importedCount = 0;
    let skippedCount = 0;

    for (const result of osmResults) {
        try {
            await prisma.towerLead.upsert({
                where: {
                    lat_lon_source: {
                        lat: result.lat,
                        lon: result.lon,
                        source: 'OpenStreetMap',
                    },
                },
                update: {
                    tags: result.tags || {},
                    type: result.type,
                    country,
                    city: city || null, // Use provided city or null if area search
                    province: province || null,
                },
                create: {
                    lat: result.lat,
                    lon: result.lon,
                    source: 'OpenStreetMap',
                    sourceId: result.id?.toString(),
                    type: result.type,
                    tags: result.tags || {},
                    country,
                    city: city || null,
                    province: province || null,
                },
            });

            importedCount++;
        } catch (err) {
            skippedCount++;
            console.warn(`[OSM Job] Skipping lead at ${result.lat},${result.lon}:`, err);
        }
    }

    console.log(`[OSM Job] Imported ${importedCount}, skipped ${skippedCount} for ${city || 'Any City'}, ${country}`);

    // Update the corresponding LeadSearch record
    // We match by the parameters we started with
    // If city was null in params, we match city: null in DB
    await prisma.leadSearch.updateMany({
        where: {
            country,
            city,
            province,
            source: 'OpenStreetMap'
        },
        data: {
            status: 'completed',
            resultCount: importedCount,
        },
    });

    return { importedCount, skippedCount, total: osmResults.length };
}

/**
 * Find towers that haven't been processed and submit a batch to Geoapify.
 */
async function submitGeoapifyBatch(): Promise<any> {
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
async function pollGeoapifyBatch(params: { batchId: string, towerIds: number[] }): Promise<any> {
    const { batchId, towerIds } = params;

    const statusResult = await GeoapifyService.getBatchResult(batchId);

    if (statusResult.status === 'pending') {
        throw new Error('Batch job still pending, will retry');
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
