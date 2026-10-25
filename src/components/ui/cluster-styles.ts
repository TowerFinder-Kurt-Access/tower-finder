/**
 * Basemap and cluster styling for the mapcn map.
 *
 * The mapcn defaults are CARTO vector styles, whose protomaps tiles cap at
 * zoom 15. This dashboard draws at zoom 18 and the tower detail page reads at
 * zoom 17, so the basemap here is the same Esri raster the Leaflet stack used.
 * It keeps the zoom range and the light gray look, and needs no API key.
 */

import type { MapStyleOption } from '@/components/ui/map';

const ESRI_ATTRIBUTION =
    'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, HERE, Garmin, ' +
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Esri World Light Gray as a MapLibre raster style. Raster tiles keep their
 * detail to zoom 18, unlike the CARTO vector tiles.
 */
export const ESRI_LIGHT_GRAY_STYLE = {
    version: 8,
    sources: {
        esri: {
            type: 'raster' as const,
            tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            // Esri serves this set to zoom 18 in North America.
            maxzoom: 18,
            attribution: ESRI_ATTRIBUTION,
        },
    },
    layers: [
        { id: 'background', type: 'background' as const, paint: { 'background-color': '#f5f5f5' } },
        { id: 'esri-tiles', type: 'raster' as const, source: 'esri', minzoom: 0, maxzoom: 18 },
    ],
} satisfies MapStyleOption;

/**
 * Cluster palettes: [small, medium, large]. `MapClusterLayer` steps on
 * `point_count` against `clusterThresholds`.
 */
export const TOWER_CLUSTER_COLORS = ['#f44336', '#d32f2f', '#b71c1c'] as const;
export const LEAD_CLUSTER_COLORS = ['#4caf50', '#388e3c', '#1b5e20'] as const;

/** Point colors, matching the current Leaflet marker fills. */
export const TOWER_POINT_COLOR = '#e53935';
export const LEAD_POINT_COLOR = '#66bb6a';
