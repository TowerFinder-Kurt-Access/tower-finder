import { processOSMLeads } from './jobs/osm';
import { submitGeoapifyBatch, pollGeoapifyBatch } from './jobs/geoapify';
import { processNRCanBatch } from './jobs/nrcan';
import { validatePhoneNumbers } from './jobs/phone-validation';
import { normalizeLocations } from './jobs/normalization';

/**
 * Registry of job type → handler function.
 * Each handler receives the job's `params` and returns a result object.
 * Throw an error to mark the job as failed (will retry if attempts remain).
 * 
 * Note: fcc_rooftop_discovery is imported dynamically because it depends on Playwright,
 * which shouldn't be eagerly loaded in the Vercel environment.
 */
export const JOB_HANDLERS: Record<string, (params: any) => Promise<any>> = {
    'process_open_street_map_leads': processOSMLeads,
    'submit_geoapify_batch': submitGeoapifyBatch,
    'poll_geoapify_batch': pollGeoapifyBatch,
    'process_nrcan_batch': processNRCanBatch,
    'validate_phone_numbers': validatePhoneNumbers,
    'normalize_locations': normalizeLocations,
    'fcc_rooftop_discovery': async (params: any) => {
        // Dynamic import to prevent Playwright/Chromium being bundled eagerly 
        // and causing build errors on environments like Vercel.
        const { processFCCDiscovery } = await import('./jobs/fccDiscovery');
        return processFCCDiscovery(params);
    }
};