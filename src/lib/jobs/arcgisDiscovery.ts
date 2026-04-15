import axios from 'axios';
import { prisma } from '@/lib/prisma';

/**
 * HIFLD Cellular Towers dataset (FCC data hosted on ArcGIS by Esri/HIFLD).
 * No authentication required.
 *
 * FCC StrucType codes for building-mounted (rooftop) antennas:
 *   B     = Building
 *   BANT  = Building + Antenna
 *   BMAST = Building + Mast
 *   BPIPE = Building + Pipe
 *   BPOLE = Building + Pole
 *   BTWR  = Building + Tower
 */
const ARCGIS_CT_URL =
    'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Cellular_Towers_in_the_United_States/FeatureServer/0/query';

const BUILDING_TYPES = ['B', 'BANT', 'BMAST', 'BPIPE', 'BPOLE', 'BTWR'];
const PAGE_SIZE = 2000; // ArcGIS max per request

/** Retry a function up to N times with delay on transient errors */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 3000): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err: any) {
            const isTransient =
                err?.code === 'P1001' ||
                err?.code === 'P1002' ||
                err?.message?.includes("Can't reach database") ||
                err?.code === 'ECONNRESET' ||
                err?.code === 'ETIMEDOUT';
            if (isTransient && i < retries - 1) {
                console.warn(`[ArcGIS-Job] Transient error, retrying in ${delayMs / 1000}s (attempt ${i + 1}/${retries})...`);
                await new Promise(res => setTimeout(res, delayMs));
                continue;
            }
            throw err;
        }
    }
    throw new Error('withRetry exhausted');
}

/**
 * Fetch all building-mounted antennas for a given state + county from the
 * HIFLD Cellular Towers ArcGIS REST API.
 * Handles pagination automatically via resultOffset.
 */
async function fetchBuildingAntennas(stateCode: string, county: string): Promise<any[]> {
    const typeList = BUILDING_TYPES.map(t => `'${t}'`).join(',');
    const where = `LocState = '${stateCode}' AND LocCounty LIKE '${county.replace(/'/g, "''")}%' AND StrucType IN (${typeList})`;

    const allFeatures: any[] = [];
    let offset = 0;

    while (true) {
        const response = await axios.get(ARCGIS_CT_URL, {
            params: {
                where,
                outFields: 'Licensee,Callsign,StrucType,LocCity,LocCounty,LocState,LocAdd,latdec,londec',
                returnGeometry: false,
                resultRecordCount: PAGE_SIZE,
                resultOffset: offset,
                f: 'json',
            },
            timeout: 20000,
        });

        if (response.data.error) {
            throw new Error(`ArcGIS API error: ${JSON.stringify(response.data.error)}`);
        }

        const features: any[] = response.data.features || [];
        allFeatures.push(...features);

        // If the API signals there are more records, keep paginating
        if (response.data.exceededTransferLimit && features.length === PAGE_SIZE) {
            offset += PAGE_SIZE;
            continue;
        }

        break;
    }

    return allFeatures;
}

/**
 * ArcGIS County Discovery Job Handler
 *
 * Params:
 *   state     {string} Full state name, e.g. "California"
 *   stateCode {string} 2-letter code,   e.g. "CA"
 *   county    {string} County name,     e.g. "Los Angeles"
 *   scanId    {number} DiscoveryScan.id for progress tracking
 */
export async function processArcGISCountyDiscovery(
    params: Record<string, any>,
    _jobId?: number | string
) {
    const { state, stateCode, county, scanId } = params;

    console.log(`[ArcGIS-Job] Starting: ${county}, ${stateCode}`);

    let foundCount = 0;

    try {
        const features = await withRetry(() => fetchBuildingAntennas(stateCode, county));

        console.log(`[ArcGIS-Job] ${county}: ${features.length} building-mounted antenna(s) found.`);

        for (const f of features) {
            const a = f.attributes;
            const lat = a.latdec;
            const lon = a.londec;

            // Skip records without coordinates
            if (!lat || !lon) continue;

            await withRetry(() =>
                prisma.towerLead.upsert({
                    where: {
                        lat_lon_source: {
                            lat,
                            lon,
                            source: 'ARCGIS_CT',
                        },
                    },
                    update: {
                        tags: a as any,
                        updatedAt: new Date(),
                    },
                    create: {
                        lat,
                        lon,
                        source: 'ARCGIS_CT',
                        sourceId: a.Callsign || null,
                        type: 'rooftop',
                        country: 'US',
                        province: state || null,
                        city: a.LocCity || county || null,
                        tags: a as any,
                    },
                })
            );

            foundCount++;
        }
    } catch (error: any) {
        console.error(`[ArcGIS-Job] Error processing ${county}:`, error.message);

        if (scanId) {
            try {
                await withRetry(() =>
                    (prisma.discoveryScan as any).update({
                        where: { id: scanId },
                        data: { failedCounties: { increment: 1 } },
                    })
                );
            } catch {}
        }

        throw error;
    }

    // Update DiscoveryScan progress
    if (scanId) {
        try {
            const scan: any = await withRetry(() =>
                (prisma.discoveryScan as any).update({
                    where: { id: scanId },
                    data: {
                        completedCounties: { increment: 1 },
                        foundLeads: { increment: foundCount },
                    },
                })
            );

            const pct = ((scan.completedCounties / (scan.totalCounties || 1)) * 100).toFixed(1);
            console.log(
                `[ArcGIS-Job] Progress: ${scan.completedCounties}/${scan.totalCounties} (${pct}%) — ${scan.foundLeads} rooftops total.`
            );

            if (scan.completedCounties + scan.failedCounties >= scan.totalCounties) {
                await withRetry(() =>
                    (prisma.discoveryScan as any).update({
                        where: { id: scanId },
                        data: { status: 'completed', completedAt: new Date() },
                    })
                );
                console.log(`[ArcGIS-Job] ✅ ${state} discovery COMPLETE!`);
            }
        } catch (dbErr: any) {
            console.warn(`[ArcGIS-Job] Progress update failed:`, dbErr.message);
        }
    }

    return { county, state, foundCount };
}
