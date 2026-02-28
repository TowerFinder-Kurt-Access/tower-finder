export { processOSMLeads } from './jobs/osm';
export { submitGeoapifyBatch, pollGeoapifyBatch } from './jobs/geoapify';
export { processNRCanBatch } from './jobs/nrcan';

import { processOSMLeads } from './jobs/osm';
import { submitGeoapifyBatch, pollGeoapifyBatch } from './jobs/geoapify';
import { processNRCanBatch } from './jobs/nrcan';

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
};