import { prisma } from '@/lib/prisma';

export class GeoapifyQuotaError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GeoapifyQuotaError';
    }
}

export class GeoapifyService {
    private static API_KEY = process.env.GEOAPIFY_API_KEY;
    private static BATCH_URL = 'https://api.geoapify.com/v1/batch';
    private static PLACES_URL = 'https://api.geoapify.com/v2/places';

    /**
     * Submit a batch job to find businesses near towers.
     * We use the batch API to minimize costs by sending multiple points at once.
     */
    static async submitPlacesBatch(towers: { id: number; lat: number; lon: number }[]) {
        if (!this.API_KEY) throw new Error('GEOAPIFY_API_KEY is not set');

        // Construct the batch query
        // For each tower, we want to find "commercial" places within 2000m
        const queries = towers.map(tower => ({
            params: {
                categories: 'commercial',
                filter: `circle:${tower.lon},${tower.lat},2000`,
                bias: `proximity:${tower.lon},${tower.lat}`,
                limit: 20
            }
        }));

        const response = await fetch(`${this.BATCH_URL}?apiKey=${this.API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: '/v2/places',
                params: {
                    categories: 'commercial',
                    limit: 20
                },
                inputs: queries
            })
        });

        if (!response.ok) {
            const error = await response.text();
            if (response.status === 429) {
                throw new GeoapifyQuotaError(`Geoapify Quota Exceeded: ${error}`);
            }
            throw new Error(`Geoapify Batch Submission failed: ${error}`);
        }

        const data = await response.json();
        return data.id; // Return the Geoapify Batch Job ID
    }

    /**
     * Poll for the results of a batch job.
     * Returns the full result set or throws if not ready.
     */
    static async getBatchResult(batchJobId: string) {
        if (!this.API_KEY) throw new Error('GEOAPIFY_API_KEY is not set');

        const response = await fetch(`${this.BATCH_URL}?id=${batchJobId}&apiKey=${this.API_KEY}`);

        if (!response.ok) {
            const error = await response.text();
            if (response.status === 429) {
                throw new GeoapifyQuotaError(`Geoapify Quota Exceeded: ${error}`);
            }
            throw new Error(`Geoapify Batch Result fetch failed: ${error}`);
        }

        // Geoapify returns 202 Accepted if still processing
        if (response.status === 202) {
            return { status: 'pending' };
        }

        const data = await response.json();
        return { status: 'completed', results: data };
    }
}
