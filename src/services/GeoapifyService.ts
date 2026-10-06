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

    /** Search radius around each tower, in meters. */
    static readonly SEARCH_RADIUS_M = 2000;
    /** Places per tower. Geoapify returns them nearest-first, so this only trims the tail. */
    static readonly SEARCH_LIMIT = 50;
    /** Roots that hold callable businesses; `commercial` alone misses banks and restaurants. */
    static readonly CATEGORIES = 'commercial,catering,office,healthcare,service';
    /** Public services that share a root with businesses but are not callable leads. */
    static readonly NON_BUSINESS_CATEGORIES = [
        'service.emergency',
        'service.fire_station',
        'service.police',
        'service.recycling',
        'service.social_facility'
    ];

    /** Submits a batch job that finds businesses near each tower. */
    static async submitPlacesBatch(towers: { id: number; lat: number; lon: number }[]) {
        if (!this.API_KEY) throw new Error('GEOAPIFY_API_KEY is not set');

        const queries = towers.map(tower => ({
            params: {
                categories: this.CATEGORIES,
                filter: `circle:${tower.lon},${tower.lat},${this.SEARCH_RADIUS_M}`,
                bias: `proximity:${tower.lon},${tower.lat}`,
                limit: this.SEARCH_LIMIT
            }
        }));

        const response = await fetch(`${this.BATCH_URL}?apiKey=${this.API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api: '/v2/places',
                params: {
                    categories: this.CATEGORIES,
                    limit: this.SEARCH_LIMIT
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

        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
            throw new Error('Geoapify Batch Submission returned no batch id');
        }
        return data.id;
    }

    /** Polls a batch job and returns its raw result set once ready. */
    static async getBatchResult(batchJobId: string): Promise<{ status: 'pending' } | { status: 'completed'; results: unknown }> {
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
