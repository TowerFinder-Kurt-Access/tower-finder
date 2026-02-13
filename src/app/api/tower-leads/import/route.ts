import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { TowerSearchService } from '@/services/TowerSearchService';

// Province bounding boxes for bulk import (approximate)
const PROVINCE_BOUNDS: Record<string, { north: number; south: number; east: number; west: number }> = {
    'British Columbia': { north: 60.0, south: 48.3, east: -114.0, west: -139.1 },
    'Alberta': { north: 60.0, south: 49.0, east: -110.0, west: -120.0 },
    'Saskatchewan': { north: 60.0, south: 49.0, east: -101.4, west: -110.0 },
    'Manitoba': { north: 60.0, south: 49.0, east: -88.9, west: -102.0 },
    'Ontario': { north: 56.9, south: 41.7, east: -74.3, west: -95.2 },
    'Quebec': { north: 62.6, south: 45.0, east: -57.1, west: -79.8 },
    'New Brunswick': { north: 48.1, south: 44.6, east: -63.8, west: -69.1 },
    'Nova Scotia': { north: 47.0, south: 43.4, east: -59.7, west: -66.4 },
    'Prince Edward Island': { north: 47.1, south: 45.9, east: -62.0, west: -64.5 },
    'Newfoundland and Labrador': { north: 60.4, south: 46.6, east: -52.6, west: -67.8 },
};

// POST /api/tower-leads/import - Import leads from a source for a province
export async function POST(request: Request) {
    try {
        await getAuthUser();

        const body = await request.json();
        const { province, source = 'OpenStreetMap' } = body;

        if (!province) {
            return NextResponse.json({ error: 'Province is required' }, { status: 400 });
        }

        // Check if we already have leads for this province + source
        const existingCount = await prisma.towerLead.count({
            where: { province, source }
        });

        if (existingCount > 0) {
            // Already imported - just return the count
            return NextResponse.json({
                imported: 0,
                existing: existingCount,
                message: `Already have ${existingCount} leads from ${source} for ${province}. Serving from local DB.`
            });
        }

        // Only call external API if we don't have local data
        if (source === 'OpenStreetMap') {
            const bounds = PROVINCE_BOUNDS[province];
            if (!bounds) {
                return NextResponse.json({ error: `Unknown province: ${province}` }, { status: 400 });
            }

            console.log(`[Tower Leads Import] Fetching from OSM for ${province}...`);
            const osmResults = await TowerSearchService.searchInBounds(
                bounds.north, bounds.south, bounds.east, bounds.west
            );

            console.log(`[Tower Leads Import] Got ${osmResults.length} results from OSM for ${province}`);

            // Bulk upsert leads
            let importedCount = 0;
            for (const result of osmResults) {
                try {
                    await prisma.towerLead.upsert({
                        where: {
                            lat_lon_source: {
                                lat: result.lat,
                                lon: result.lon,
                                source
                            }
                        },
                        update: {
                            tags: result.tags || {},
                            type: result.type
                        },
                        create: {
                            lat: result.lat,
                            lon: result.lon,
                            source,
                            sourceId: result.id.toString(),
                            type: result.type,
                            tags: result.tags || {},
                            province
                        }
                    });
                    importedCount++;
                } catch (err) {
                    // Skip duplicates or errors, continue
                    console.warn(`[Tower Leads Import] Skipping lead at ${result.lat},${result.lon}:`, err);
                }
            }

            console.log(`[Tower Leads Import] Imported ${importedCount} leads for ${province}`);

            return NextResponse.json({
                imported: importedCount,
                existing: 0,
                message: `Imported ${importedCount} leads from ${source} for ${province}.`
            });
        }

        return NextResponse.json({ error: `Unsupported source: ${source}` }, { status: 400 });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error importing tower leads:', error);
        return NextResponse.json({ error: 'Failed to import tower leads' }, { status: 500 });
    }
}
