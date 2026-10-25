/**
 * Basemap styles, map modes, and cluster palettes for the mapcn map.
 *
 * Modelled on the Hazr map's "Map details" panel: four basemap styles plus two
 * display modes. CARTO styles carry OpenStreetMap data and their own label
 * layers, including `place_country_1` and `place_country_2`, which is where the
 * country names come from. An Esri raster cannot supply those, because its
 * labels are baked into the image.
 */

import type { MapStyleOption } from '@/components/ui/map';

/** A basemap the user can pick from the map details panel. */
export interface MapStyleOptionEntry {
    id: MapStyleId;
    label: string;
    /** Style URL. A string keeps every CARTO layer and label rule in sync. */
    url: MapStyleOption;
    /** Swatch used by the picker, so the UI does not need a screenshot. */
    swatch: { background: string; land: string; water: string };
}

export type MapStyleId = 'light' | 'dark' | 'voyager' | 'satellite';

export const MAP_STYLES: Record<MapStyleId, MapStyleOptionEntry> = {
    light: {
        id: 'light',
        label: 'Light',
        url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        swatch: { background: '#e8eaed', land: '#f7f7f5', water: '#bae6fd' },
    },
    dark: {
        id: 'dark',
        label: 'Dark',
        url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        swatch: { background: '#0f172a', land: '#1a1a1a', water: '#1e3a8a' },
    },
    voyager: {
        id: 'voyager',
        label: 'Voyager',
        url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        swatch: { background: '#fef3c7', land: '#fdf6e3', water: '#7dd3fc' },
    },
    // Satellite has real detail in rural areas where the vector styles have no
    // data above zoom 15, which is where tower parcels are inspected.
    satellite: {
        id: 'satellite',
        label: 'Satellite',
        url: {
            version: 8,
            glyphs: 'https://tiles.basemaps.cartocdn.com/v/20261001-03/fonts/{fontstack}/{range}.pbf',
            sources: {
                imagery: {
                    type: 'raster' as const,
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    ],
                    tileSize: 256,
                    maxzoom: 19,
                    attribution:
                        'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
                },
                // Place labels over the imagery, so a satellite view still names
                // the country and city. Imagery carries no labels of its own.
                labels: {
                    type: 'raster' as const,
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
                    ],
                    tileSize: 256,
                    maxzoom: 19,
                },
            },
            layers: [
                { id: 'background', type: 'background' as const, paint: { 'background-color': '#1a1a1a' } },
                { id: 'imagery', type: 'raster' as const, source: 'imagery', minzoom: 0, maxzoom: 19 },
                { id: 'imagery-labels', type: 'raster' as const, source: 'labels', minzoom: 0, maxzoom: 19 },
            ],
        },
        swatch: { background: '#1a2e1a', land: '#2d4a2d', water: '#1e3a5f' },
    },
};

/** Basemap used before the user picks one. */
export const DEFAULT_MAP_STYLE: MapStyleId = 'light';

/** Display modes from the same panel. */
export interface MapModeState {
    /** Globe projection instead of the flat mercator view. */
    globe: boolean;
    /** Extruded buildings above zoom 14. */
    buildings3d: boolean;
}

export const DEFAULT_MAP_MODES: MapModeState = { globe: false, buildings3d: false };

/**
 * Cluster palettes: [small, medium, large]. `MapClusterLayer` steps on
 * `point_count` against `clusterThresholds`.
 *
 * The dark and satellite basemaps need lighter cluster fills to stay legible,
 * so each style gets its own palette.
 */
export const TOWER_CLUSTER_COLORS = ['#f44336', '#d32f2f', '#b71c1c'] as const;
export const LEAD_CLUSTER_COLORS = ['#4caf50', '#388e3c', '#1b5e20'] as const;

/** Cluster palettes for a dark basemap, where the deep reds would disappear. */
export const TOWER_CLUSTER_COLORS_DARK = ['#ff7961', '#f44336', '#d32f2f'] as const;
export const LEAD_CLUSTER_COLORS_DARK = ['#81c784', '#4caf50', '#388e3c'] as const;

/** Point colors, matching the current Leaflet marker fills. */
export const TOWER_POINT_COLOR = '#e53935';
export const LEAD_POINT_COLOR = '#66bb6a';

/** True when the basemap is dark enough to need the lighter palettes. */
export function isDarkBasemap(style: MapStyleId): boolean {
    return style === 'dark' || style === 'satellite';
}
