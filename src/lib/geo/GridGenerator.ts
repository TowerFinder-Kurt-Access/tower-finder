import * as h3 from 'h3-js';

/**
 * GridGenerator
 * Uses Uber H3 indexing to partition geographic areas into searchable hexagons.
 */
export class GridGenerator {
    /**
     * Converts a GeoJSON polygon into a list of H3 hexagonal cell IDs.
     * @param geojson GeoJSON Polygon or MultiPolygon
     * @param resolution H3 resolution (e.g., 7 for ~1.2km)
     * @returns Array of H3 cell IDs (strings)
     */
    static generateCells(geojson: any, resolution: number = 7): string[] {
        if (!geojson || !geojson.geometry) {
            throw new Error('Invalid GeoJSON object provided to GridGenerator');
        }

        const type = geojson.geometry.type;
        const coordinates = geojson.geometry.coordinates;

        let cells: string[] = [];

        if (type === 'Polygon') {
            cells = h3.polygonToCells(coordinates, resolution, true);
        } else if (type === 'MultiPolygon') {
            coordinates.forEach((polyCoords: any) => {
                const polyCells = h3.polygonToCells(polyCoords, resolution, true);
                cells = cells.concat(polyCells);
            });
            // Ensure unique cells across multipolygons
            cells = Array.from(new Set(cells));
        } else {
            throw new Error(`Unsupported GeoJSON geometry type: ${type}`);
        }

        return cells;
    }

    /**
     * Gets the lat/lon centroid for a given H3 cell.
     * @param h3Index The H3 cell ID
     * @returns [lat, lon]
     */
    static getCentroid(h3Index: string): [number, number] {
        return h3.cellToLatLng(h3Index);
    }

    /**
     * Gets the boundary coordinates of an H3 cell.
     * @param h3Index The H3 cell ID
     * @returns Array of [lat, lon] coordinates
     */
    static getBoundary(h3Index: string): number[][] {
        return h3.cellToBoundary(h3Index, true);
    }
}
