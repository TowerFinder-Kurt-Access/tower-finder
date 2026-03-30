export { processOSMLeads } from './jobs/osm';
export { submitGeoapifyBatch, pollGeoapifyBatch } from './jobs/geoapify';
export { processNRCanBatch } from './jobs/nrcan';
export { validatePhoneNumbers } from './jobs/phone-validation';
export { normalizeLocations } from './jobs/normalization';
export { processFCCDiscovery } from './jobs/fccDiscovery';

import { processOSMLeads } from './jobs/osm';
import { submitGeoapifyBatch, pollGeoapifyBatch } from './jobs/geoapify';
import { processNRCanBatch } from './jobs/nrcan';
import { validatePhoneNumbers } from './jobs/phone-validation';
import { normalizeLocations } from './jobs/normalization';
import { processFCCDiscovery } from './jobs/fccDiscovery';

/**
 * Registry of job type → handler function.
 * Each handler receives the job's `params` and returns a result object.
 * Throw an error to mark the job as failed (will retry if attempts remain).
 */
export const JOB_HANDLERS: Record<string, (params: any) => Promise<any>> = {
    'process_open_street_map_leads': processOSMLeads,
    'submit_geoapify_batch': submitGeoapifyBatch,
    'poll_geoapify_batch': pollGeoapifyBatch,
    'process_nrcan_batch': processNRCanBatch,
    'validate_phone_numbers': validatePhoneNumbers,
    'normalize_locations': normalizeLocations,
    'fcc_rooftop_discovery': processFCCDiscovery,
};