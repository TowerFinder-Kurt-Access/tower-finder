import { prisma } from '@/lib/prisma';
import { TowerSearchService } from '@/services/TowerSearchService';

/**
 * Registry of job type → handler function.
 * Each handler receives the job's `params` and returns a result object.
 * Throw an error to mark the job as failed (will retry if attempts remain).
 */
export const JOB_HANDLERS: Record<string, (params: any) => Promise<any>> = {
    'process_open_street_map_leads': processOSMLeads,
};

// City bounding boxes for OSM queries
// Format: { north, south, east, west }
const CITY_BOUNDS: Record<string, Record<string, { north: number; south: number; east: number; west: number }>> = {
    'Canada': {
        'Moncton': { north: 46.15, south: 46.05, east: -64.70, west: -64.85 },
        'Toronto': { north: 43.86, south: 43.58, east: -79.10, west: -79.65 },
        'Vancouver': { north: 49.35, south: 49.20, east: -123.00, west: -123.30 },
        'Montreal': { north: 45.62, south: 45.40, east: -73.47, west: -73.75 },
        'Calgary': { north: 51.18, south: 50.87, east: -113.90, west: -114.27 },
        'Edmonton': { north: 53.65, south: 53.40, east: -113.30, west: -113.70 },
        'Ottawa': { north: 45.50, south: 45.25, east: -75.55, west: -75.85 },
        'Winnipeg': { north: 49.98, south: 49.75, east: -96.95, west: -97.35 },
        'Halifax': { north: 44.72, south: 44.58, east: -63.50, west: -63.70 },
        'Quebec City': { north: 46.90, south: 46.75, east: -71.15, west: -71.40 },
        'Saskatoon': { north: 52.20, south: 52.07, east: -106.55, west: -106.75 },
        'Regina': { north: 50.52, south: 50.38, east: -104.52, west: -104.72 },
        'St. John\'s': { north: 47.62, south: 47.50, east: -52.65, west: -52.80 },
        'Victoria': { north: 48.50, south: 48.40, east: -123.30, west: -123.45 },
        'Fredericton': { north: 46.00, south: 45.90, east: -66.58, west: -66.72 },
        'Charlottetown': { north: 46.28, south: 46.22, east: -63.10, west: -63.18 },
    },
    'USA': {
        'New York': { north: 40.92, south: 40.49, east: -73.70, west: -74.26 },
        'Los Angeles': { north: 34.34, south: 33.70, east: -118.15, west: -118.67 },
        'Chicago': { north: 42.02, south: 41.64, east: -87.52, west: -87.94 },
        'Houston': { north: 30.11, south: 29.52, east: -95.07, west: -95.79 },
        'Miami': { north: 25.86, south: 25.70, east: -80.12, west: -80.32 },
    },
    'Mexico': {
        'Mexico City': { north: 19.59, south: 19.20, east: -98.94, west: -99.37 },
        'Guadalajara': { north: 20.78, south: 20.58, east: -103.28, west: -103.48 },
        'Monterrey': { north: 25.82, south: 25.57, east: -100.22, west: -100.47 },
    },
};

/**
 * Process OSM leads for a given country + city.
 * Queries the Overpass API and upserts results into TowerLead.
 */
async function processOSMLeads(params: { country: string; city: string }): Promise<any> {
    const { country, city } = params;

    if (!country || !city) {
        throw new Error('country and city are required parameters');
    }

    // Look up bounding box
    const countryBounds = CITY_BOUNDS[country];
    if (!countryBounds) {
        throw new Error(`No bounding box data for country: ${country}`);
    }

    const bounds = countryBounds[city];
    if (!bounds) {
        throw new Error(`No bounding box data for city: ${city} in ${country}`);
    }

    console.log(`[OSM Job] Fetching leads for ${city}, ${country}...`);

    // Query OSM
    const osmResults = await TowerSearchService.searchInBounds(
        bounds.north, bounds.south, bounds.east, bounds.west
    );

    console.log(`[OSM Job] Got ${osmResults.length} results from OSM for ${city}, ${country}`);

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
                    city,
                },
                create: {
                    lat: result.lat,
                    lon: result.lon,
                    source: 'OpenStreetMap',
                    sourceId: result.id?.toString(),
                    type: result.type,
                    tags: result.tags || {},
                    country,
                    city,
                },
            });
            importedCount++;
        } catch (err) {
            skippedCount++;
            console.warn(`[OSM Job] Skipping lead at ${result.lat},${result.lon}:`, err);
        }
    }

    console.log(`[OSM Job] Imported ${importedCount}, skipped ${skippedCount} for ${city}, ${country}`);

    // Update the corresponding LeadSearch record
    await prisma.leadSearch.updateMany({
        where: { country, city, source: 'OpenStreetMap' },
        data: {
            status: 'completed',
            resultCount: importedCount,
        },
    });

    return { importedCount, skippedCount, total: osmResults.length };
}
