import { prisma } from '@/lib/prisma';
import { TowerSearchService } from '@/services/TowerSearchService';

/**
 * Process OSM leads for a given country + city (optional).
 * Queries the Overpass API and upserts results into TowerLead.
 */
export async function processOSMLeads(params: { country: string; province?: string; city?: string }): Promise<any> {
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
