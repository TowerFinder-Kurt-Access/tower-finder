import { prisma } from '@/lib/prisma';

/**
 * Calculates the Haversine distance between two points in meters.
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

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

        // 2. Perform 50m distance check in memory (since we're blocked on PostGIS)
        const nearbySignals = await prisma.towerLead.findMany({
            where: {
                source: 'CellMapper',
                lat: { gte: lead.lat - 0.001, lte: lead.lat + 0.001 }, // Quick bounding box 
                lon: { gte: lead.lon - 0.001, lte: lead.lon + 0.001 }
            }
        });

        // Filter to exact 50m using Haversine
        const matches = nearbySignals.filter(s => {
            const dist = calculateDistance(lead.lat, lead.lon, s.lat, s.lon);
            return dist <= 50;
        });

        if (matches.length > 0) {
            // WE HAVE A MATCH! High or Medium Score
            const signal = matches[0];
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

    // 4. Handle CellMapper-only signals (Discovery without AntennaSearch match)
    const allSignals = await prisma.towerLead.findMany({
        where: { source: 'CellMapper' }
    });

    for (const signal of allSignals) {
        const signalTags = signal.tags as any;
        const siteId = String(signalTags.siteID || signalTags.id);

        // Check if this signal has already been promoted (by Site ID in rawData)
        // This is a bit slow but necessary without better indexing
        const existingLog = await prisma.cellMapperLog.findFirst({
            where: {
                OR: [
                    { rawData: { path: ['signal', 'siteID'], equals: siteId } },
                    { rawData: { path: ['signal', 'id'], equals: siteId } }
                ]
            }
        });

        if (!existingLog) {
            // New discovery!
            console.log(`[Fusion] New standalone signal discovery at ${signal.lat},${signal.lon} (Site: ${siteId})`);
            
            await prisma.tower.upsert({
                where: { lat_lon: { lat: signal.lat, lon: signal.lon } },
                update: {
                    businessName: `AT&T Site ${siteId}`,
                    source: 'Signal Discovery',
                    cellMapperLog: {
                        upsert: {
                            create: {
                                h3Index: params.h3Index || 'unknown',
                                matchScore: 'Potential',
                                structureType: 'Signal',
                                isVerified: !!signalTags.visible,
                                lastVerifiedAt: new Date(),
                                rawData: { signal: signalTags }
                            },
                            update: {
                                lastVerifiedAt: new Date(),
                                rawData: { signal: signalTags }
                            }
                        }
                    }
                },
                create: {
                    lat: signal.lat,
                    lon: signal.lon,
                    businessName: `AT&T Site ${siteId}`,
                    source: 'Signal Discovery',
                    cellMapperLog: {
                        create: {
                            h3Index: params.h3Index || 'unknown',
                            matchScore: 'Potential',
                            structureType: 'Signal',
                            isVerified: !!signalTags.visible,
                            lastVerifiedAt: new Date(),
                            rawData: { signal: signalTags }
                        }
                    }
                }
            });
        }
    }

    return { status: 'completed' };
}
