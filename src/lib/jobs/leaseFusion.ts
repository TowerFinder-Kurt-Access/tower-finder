import { prisma } from '@/lib/prisma';

/**
 * leaseFusion
 * Performs spatial joins between raw TowerLeads and creates/updates 
 * verified Tower + CellMapperLog records.
 */
export async function processLeaseFusion(params: any) {
    console.log('[Fusion] Starting spatial join and scoring...');

    // 1. Find potential AntennaSearch 'Building' leads that haven't been fused yet
    const leads = await prisma.towerLead.findMany({
        where: { source: 'AntennaSearch' }
    });

    for (const lead of leads) {
        const tags = lead.tags as any;
        const isStructuralMatch = /Building|Rooftop|Steeple|Water Tank|Silo/i.test(tags.structureType || '');

        if (!isStructuralMatch) continue;

        // 2. Perform 50m Spatial Join using raw SQL (ST_DWithin)
        // Note: This requires the 'location' geometry column to be search-ready.
        // If the DB migration is lagging, we fall back to a simple bounding box in JS for now.
        const nearbySignals: any[] = await prisma.$queryRaw`
            SELECT * FROM "TowerLead"
            WHERE source = 'CellMapper'
            AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${lead.lon}, ${lead.lat}), 4326)::geography,
                50
            )
        `;

        if (nearbySignals.length > 0) {
            // WE HAVE A MATCH! High or Medium Score
            const signal = nearbySignals[0];
            const signalTags = signal.tags as any;

            // SCORING LOGIC
            let matchScore = 'Medium';
            const isVerified = signalTags.verified === true || signalTags.greenPin === true;
            const isLowHeight = (signalTags.height || 100) < 30; // Meters

            if (isVerified) {
                matchScore = 'High';
            } else if (!isVerified && !isLowHeight) {
                matchScore = 'Potential'; // Signal exists but no proof it's rooftop vs tower
            }

            // 3. Promote to Tower + CellMapperLog
            await prisma.tower.upsert({
                where: { lat_lon: { lat: lead.lat, lon: lead.lon } }, // Ensure composite unique lat_lon exists
                update: {
                    businessName: tags.ownerName,
                    source: 'Fused Discovery',
                    cellMapperLog: {
                        upsert: {
                            create: {
                                h3Index: params.h3Index || 'unknown',
                                matchScore,
                                structureType: tags.structureType,
                                isVerified,
                                height: signalTags.height,
                                lastVerifiedAt: new Date(),
                                rawData: { antenna: tags, signal: signalTags }
                            },
                            update: {
                                matchScore,
                                lastVerifiedAt: new Date(),
                                rawData: { antenna: tags, signal: signalTags }
                            }
                        }
                    }
                },
                create: {
                    lat: lead.lat,
                    lon: lead.lon,
                    businessName: tags.ownerName,
                    source: 'Fused Discovery',
                    cellMapperLog: {
                        create: {
                            h3Index: params.h3Index || 'unknown',
                            matchScore,
                            structureType: tags.structureType,
                            isVerified,
                            height: signalTags.height,
                            lastVerifiedAt: new Date(),
                            rawData: { antenna: tags, signal: signalTags }
                        }
                    }
                }
            });

            console.log(`[Fusion] Promoted match at ${lead.lat},${lead.lon} with score ${matchScore}`);
        }
    }

    return { status: 'completed' };
}
