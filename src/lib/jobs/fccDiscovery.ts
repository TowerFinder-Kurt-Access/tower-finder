import { prisma } from '@/lib/prisma';
import { FCCService } from '@/services/FCCService';

/** Retry a function up to N times with delay on transient DB errors */
async function dbRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err: any) {
            const isTransient = err?.code === 'P1001' || err?.code === 'P1002' || err?.message?.includes("Can't reach database");
            if (isTransient && i < retries - 1) {
                console.warn(`[FCC-Job] DB transient error, retrying in ${delayMs / 1000}s... (attempt ${i + 1}/${retries})`);
                await new Promise(res => setTimeout(res, delayMs));
                continue;
            }
            throw err;
        }
    }
    throw new Error('dbRetry exhausted');
}

/**
 * FCC County Discovery Job Handler
 * Processes a single County for a State: runs the 2-step FCC ULS pipeline,
 * saves results as TowerLeads, and updates DiscoveryScan progress.
 */
export async function processFCCDiscoveryCounty(params: Record<string, any>) {
    const { state, county, licensee, scanId } = params;

    console.log(`[FCC-County] Starting work for ${county}, ${state} (${licensee})...`);

    let foundCount = 0;

    try {
        // Run the stable county discovery
        const results = await FCCService.discoverCountyLeads(state, county, licensee);

        console.log(`[FCC-County] Verification complete. Found ${results.length} building sites in ${county}.`);

        for (const lic of results) {
            await dbRetry(() => prisma.towerLead.upsert({
                where: {
                    lat_lon_source: {
                        lat: lic.lat,
                        lon: lic.lon,
                        source: 'FCC_ULS'
                    }
                },
                update: {
                    tags: lic as any,
                    updatedAt: new Date()
                },
                create: {
                    lat: lic.lat,
                    lon: lic.lon,
                    source: 'FCC_ULS',
                    sourceId: lic.registrationId || null,
                    type: 'rooftop',
                    country: 'US',
                    province: state || null,
                    city: county || null,
                    tags: lic as any
                }
            }));
            foundCount++;
        }
    } catch (error: any) {
        console.error(`[FCC-County] Error processing ${county}:`, error.message);
        
        if (scanId) {
            try {
                await dbRetry(() => prisma.discoveryScan.update({
                    where: { id: scanId },
                    data: { failedCounties: { increment: 1 } }
                }));
            } catch (dbErr: any) {
                 console.warn(`[FCC-County] Progress failure:`, dbErr.message);
            }
        }
        throw error;
    }

    // Update Progress
    if (scanId) {
        try {
            const scan = await dbRetry(() => prisma.discoveryScan.update({
                where: { id: scanId },
                data: {
                    completedCounties: { increment: 1 },
                    foundLeads: { increment: foundCount }
                }
            }));

            const pct = ((scan.completedCounties / (scan.totalCounties || 1)) * 100).toFixed(1);
            console.log(`[FCC-County] Progress: ${scan.completedCounties}/${scan.totalCounties} (${pct}%) — ${scan.foundLeads} rooftops found.`);

            if (scan.completedCounties + scan.failedCounties >= scan.totalCounties) {
                await dbRetry(() => prisma.discoveryScan.update({
                    where: { id: scanId },
                    data: { status: 'completed', completedAt: new Date() }
                }));
                console.log(`[FCC-County] ✅ State ${state} DISCOVERY DONE!`);
            }
        } catch (dbErr: any) {
            console.warn(`[FCC-County] Final progress update failed:`, dbErr.message);
        }
    }

    return { county, state, foundCount };
}

/** Legacy support or shared entry */
export async function processFCCDiscovery(params: Record<string, any>) {
    if (params.county) {
        return processFCCDiscoveryCounty(params);
    }
    // ... rest of old code if needed, but we are moving to county
}
