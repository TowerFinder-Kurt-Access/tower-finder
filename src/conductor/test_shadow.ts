import { FCCService } from '@/services/FCCService';
import { CellMapperService } from '@/services/CellMapperService';

/**
 * SHADOW RUN TEST
 * Targeted verification for known downtown rooftop sites.
 */
async function shadowRun() {
    console.log('[ShadowRun] Testing core engine logic (FCC + CellMapper)...');

    // Downtown Chicago Test (Millennium Park Area)
    const lat = 41.881832;
    const lon = -87.623177;

    console.log(`[ShadowRun] Testing FCC ULS (Official Bypass) at ${lat},${lon}...`);
    const licenses = await FCCService.fetchAntennas(lat, lon, 0.5); // 0.5 mile radius
    console.log(`[ShadowRun] Found ${licenses.length} AT&T FCC licenses.`);
    
    if (licenses.length > 0) {
        console.log('[ShadowRun] Sample FCC License:', JSON.stringify(licenses[0], null, 2));
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
