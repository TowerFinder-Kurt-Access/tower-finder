import axios from 'axios';

export interface OverpassTower {
    id: number;
    lat: number;
    lon: number;
    tags: {
        [key: string]: string;
    };
    type: string;
}

interface LocationBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

interface NominatimPlace {
    boundingbox: number[];
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_TIMEOUT_MS = 8000;
const BOUNDS_CACHE_TTL_MS = 10 * 60 * 1000;
const boundsCache = new Map<string, { bounds: LocationBounds | null; expiresAt: number }>();
const inFlightBoundsRequests = new Map<string, Promise<LocationBounds | null>>();

export class TowerSearchService {
    static async searchInBounds(north: number, south: number, east: number, west: number): Promise<OverpassTower[]> {
        const query = `
            [out:json][timeout:25];
            (
              node["man_made"="tower"](${south},${west},${north},${east});
              way["man_made"="tower"](${south},${west},${north},${east});
              relation["man_made"="tower"](${south},${west},${north},${east});
              node["man_made"="mast"](${south},${west},${north},${east});
              way["man_made"="mast"](${south},${west},${north},${east});
              relation["man_made"="mast"](${south},${west},${north},${east});
            );
            out body;
            >;
            out skel qt;
        `;

        try {
            const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (!response.data || !response.data.elements) {
                return [];
            }

            // Filter and map results
            const towers: OverpassTower[] = response.data.elements
                .filter((el: any) => el.type === 'node' && el.tags) // Focusing on nodes for simplicity first
                .map((el: any) => ({
                    id: el.id,
                    lat: el.lat,
                    lon: el.lon,
                    tags: el.tags,
                    type: el.tags['man_made'] || 'unknown'
                }));

            return towers;
        } catch (error) {
            console.error('Error querying Overpass API:', error);
            throw error;
        }
    }
    static async getBoundsForLocation(country: string, province?: string, city?: string): Promise<LocationBounds | null> {
        const queryParts = [];
        if (city) queryParts.push(city);
        if (province) queryParts.push(province);
        queryParts.push(country);

        const q = queryParts.join(', ');
        const cachedBounds = boundsCache.get(q);
        if (cachedBounds && cachedBounds.expiresAt > Date.now()) {
            return cachedBounds.bounds;
        }

        const inFlightRequest = inFlightBoundsRequests.get(q);
        if (inFlightRequest) {
            return inFlightRequest;
        }

        const request = axios.get<NominatimPlace[]>(NOMINATIM_URL, {
            params: {
                q,
                format: 'json',
                limit: 1,
                featuretype: city ? 'city' : (province ? 'state' : 'country')
            },
            headers: {
                'User-Agent': 'TowerFinder/1.0'
            },
            timeout: NOMINATIM_TIMEOUT_MS
        }).then(response => {
            const place = response.data?.[0];
            let bounds: LocationBounds | null = null;
            if (place) {
                const [south, north, west, east] = place.boundingbox.map(Number);
                bounds = { north, south, east, west };
            }

            boundsCache.set(q, { bounds, expiresAt: Date.now() + BOUNDS_CACHE_TTL_MS });
            return bounds;
        }).finally(() => {
            inFlightBoundsRequests.delete(q);
        });

        inFlightBoundsRequests.set(q, request);
        return request;
    }
}
