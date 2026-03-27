import { AntennaSearchService } from '@/services/AntennaSearchService';
import { CellMapperService } from '@/services/CellMapperService';

/**
 * SHADOW RUN TEST
 * Targeted verification for known downtown rooftop sites.
 */
async function shadowRun() {
    console.log('[ShadowRun] Testing core engine logic...');

    // San Francisco Downtown Centroid (Near Market St)
    const lat = 37.7882;
    const lon = -122.4075;

    console.log(`[ShadowRun] Testing AntennaSearch (Building/Rooftop filters) at ${lat},${lon}...`);
    const antennas = await AntennaSearchService.fetchAntennas(lat, lon);
    console.log(`[ShadowRun] Found ${antennas.length} potential rooftop registrations.`);
    
    if (antennas.length > 0) {
        console.log('[ShadowRun] Sample Match:', JSON.stringify(antennas[0], null, 2));
    }

    console.log(`[ShadowRun] Testing CellMapper (Stealth Interception) at ${lat},${lon}...`);
    const signals = await CellMapperService.fetchTowers(lat, lon);
    console.log(`[ShadowRun] Found ${signals.length} active AT&T signal pins.`);

    if (signals.length > 0) {
        console.log('[ShadowRun] Sample Signal:', JSON.stringify(signals[0], null, 2));
    }

    console.log('[ShadowRun] Verification Complete.');
}

shadowRun().catch(console.error);
