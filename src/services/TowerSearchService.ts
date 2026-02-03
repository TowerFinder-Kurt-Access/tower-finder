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
}
