import { prisma } from '@/lib/prisma';
import { FCCService } from '@/services/FCCService';

/**
 * FCC Rooftop Discovery Job Handler
 * Processes a single H3 cell: runs the FCC ULS scraper,
 * saves results as TowerLeads, and updates DiscoveryScan progress.
 */
export async function processFCCDiscovery(params: Record<string, any>) {
    const { lat, lon, h3Index, state, country, scanId } = params;

    console.log(`[FCC-Job] Processing cell ${h3Index} (${lat}, ${lon}) for ${state}...`);

    let foundCount = 0;

    try {
        const licenses = await FCCService.fetchAntennas(lat, lon, 1.0); // 1 mile radius for H3 res-7

        console.log(`[FCC-Job] Found ${licenses.length} AT&T licenses at cell ${h3Index}`);

        for (const lic of licenses) {
            await prisma.towerLead.upsert({
                where: {
                    lat_lon_source: {
                        lat: lic.lat ?? lat,
                        lon: lic.lon ?? lon,
                        source: 'FCC_ULS'
                    }
                },
                update: {
                    tags: lic as any,
                    updatedAt: new Date()
                },
                create: {
                    lat: lic.lat ?? lat,
                    lon: lic.lon ?? lon,
                    source: 'FCC_ULS',
                    sourceId: lic.registrationId || null,
                    type: 'rooftop',
                    country: country || 'US',
                    province: state || null,
                    tags: lic as any
                }
            });
            foundCount++;
        }
    } catch (error: any) {
        console.error(`[FCC-Job] Error processing cell ${h3Index}:`, error.message);
        // Still update progress even on failure — the cell was attempted
        if (scanId) {
            await prisma.discoveryScan.update({
                where: { id: scanId },
                data: { failedCells: { increment: 1 } }
            });
        }
        throw error; // Let the job queue handle retries
    }

    // Update DiscoveryScan progress
    if (scanId) {
        const scan = await prisma.discoveryScan.update({
            where: { id: scanId },
            data: {
                completedCells: { increment: 1 },
                foundLeads: { increment: foundCount }
            }
        });

        const pct = ((scan.completedCells / scan.totalCells) * 100).toFixed(2);
        console.log(`[FCC-Job] Progress: ${scan.completedCells}/${scan.totalCells} (${pct}%) — ${scan.foundLeads} leads found so far`);

        // Check if scan is complete
        if (scan.completedCells + scan.failedCells >= scan.totalCells) {
            await prisma.discoveryScan.update({
                where: { id: scanId },
                data: {
                    status: 'completed',
                    completedAt: new Date()
                }
            });
            console.log(`[FCC-Job] ✅ Scan for ${state} COMPLETE!`);
        }
    }

    return { h3Index, foundCount, lat, lon };
}
