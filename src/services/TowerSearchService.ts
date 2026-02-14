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
    static async getBoundsForLocation(country: string, province?: string, city?: string): Promise<{ north: number, south: number, east: number, west: number } | null> {
        try {
            const queryParts = [];
            if (city) queryParts.push(city);
            if (province) queryParts.push(province);
            queryParts.push(country);

            const q = queryParts.join(', ');

            // Use Nominatim to get bounding box
            const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q,
                    format: 'json',
                    limit: 1,
                    featuretype: city ? 'city' : (province ? 'state' : 'country')
                    // Note: featuretype isn't always reliable, but helps. 
                    // Better to just let q do the work.
                },
                headers: {
                    'User-Agent': 'TowerFinder/1.0' // Required by Nominatim
                }
            });

            if (response.data && response.data.length > 0) {
                const place = response.data[0];
                const [south, north, west, east] = place.boundingbox.map(Number);
                return { north, south, east, west };
            }

            return null;
        } catch (error) {
            console.error('Error fetching bounds from Nominatim:', error);
            return null;
        }
    }
}
