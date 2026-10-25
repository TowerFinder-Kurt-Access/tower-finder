'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GeoJSON } from 'geojson';
import { Map, MapControls, MapPopup, useMap } from '@/components/ui/map';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ESRI_LIGHT_GRAY_STYLE } from '@/components/ui/cluster-styles';

/** Zoom ceiling of the Esri basemap. */
const MAX_ZOOM = 18;

const STATE_CENTERS: Record<string, [number, number]> = {
    Illinois: [40.0, -89.0],
    Texas: [31.0, -100.0],
    California: [37.0, -120.0],
    'New York': [43.0, -75.0],
    Florida: [28.0, -82.0],
};

const STATE_ZOOMS: Record<string, number> = {
    Illinois: 7,
    Texas: 6,
    California: 6,
    Default: 7,
};

export interface DiscoveryCell {
    lat: number;
    lon: number;
    h3Index: string;
    status: 'completed' | 'pending' | 'processing' | 'failed';
    foundCount: number;
}

type CellProps = {
    h3Index: string;
    status: DiscoveryCell['status'];
    foundCount: number;
};

/** Cell color, matching the palette the Leaflet version used. */
function cellColor(cell: DiscoveryCell): string {
    if (cell.status === 'failed') return '#f44336';
    if (cell.status === 'processing') return '#2196F3';
    if (cell.status === 'completed' && (cell.foundCount || 0) > 0) return '#ff9800';
    if (cell.status === 'completed') return '#111111';
    return 'rgba(255,255,255,0.4)';
}

/**
 * H3 cells as a circle layer.
 *
 * `MapGeoJSON` draws fill and line layers only, which cannot render a point,
 * so the circle layer is managed directly through `useMap`. The paint uses a
 * `case` expression on the feature properties, so a color change is one
 * repaint rather than a layer rebuild.
 */
function CellLayer({
    data,
    onSelect,
}: {
    data: GeoJSON.FeatureCollection<GeoJSON.Point, CellProps>;
    onSelect: (h3Index: string) => void;
}) {
    const { map, isLoaded } = useMap();
    const sourceId = 'discovery-cells-source';
    const layerId = 'discovery-cells-layer';

    useEffect(() => {
        if (!isLoaded || !map) return;

        map.addSource(sourceId, { type: 'geojson', data, promoteId: 'h3Index' });
        map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-color': [
                    'case',
                    ['==', ['get', 'status'], 'failed'], '#f44336',
                    ['==', ['get', 'status'], 'processing'], '#2196F3',
                    ['all', ['==', ['get', 'status'], 'completed'], ['>', ['get', 'foundCount'], 0]], '#ff9800',
                    ['==', ['get', 'status'], 'completed'], '#111111',
                    'rgba(255,255,255,0.4)',
                ],
                'circle-radius': [
                    'case',
                    ['==', ['get', 'status'], 'completed'], 12,
                    8,
                ],
                'circle-opacity': [
                    'case',
                    ['==', ['get', 'status'], 'pending'], 0.3,
                    0.8,
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
            },
        });

        return () => {
            try {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            } catch {
                // The style may be mid-reload.
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, map]);

    useEffect(() => {
        if (!isLoaded || !map) return;
        const source = map.getSource(sourceId);
        if (source && 'setData' in source) (source as { setData: (d: unknown) => void }).setData(data);
    }, [isLoaded, map, data, sourceId]);

    useEffect(() => {
        if (!isLoaded || !map) return;

        const handleClick = (e: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
            const index = e.features?.[0]?.properties?.h3Index;
            if (typeof index === 'string') onSelect(index);
        };

        map.on('click', layerId, handleClick as never);
        map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
        });

        return () => {
            map.off('click', layerId, handleClick as never);
        };
    }, [isLoaded, map, layerId, onSelect]);

    return null;
}

/** Fit the view to the cells, with the same 30px padding the Leaflet version used. */
function FitCells({ cells }: { cells: DiscoveryCell[] }) {
    const { map } = useMap();

    useEffect(() => {
        if (!map || cells.length === 0) return;

        const lats = cells.map((c) => c.lat);
        const lons = cells.map((c) => c.lon);
        map.fitBounds(
            [
                [Math.min(...lons), Math.min(...lats)],
                [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 30 },
        );
    }, [map, cells]);

    return null;
}

export default function DiscoveryMap({ cells, state }: { cells: DiscoveryCell[]; state: string }) {
    const [selected, setSelected] = useState<DiscoveryCell | null>(null);

    // Cells stream in while a scan runs, so the collection is rebuilt per data
    // change. `selected` is re-derived from it rather than held separately.
    const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, CellProps> | null>(() => {
        const features = cells
            .filter((c) => typeof c.lat === 'number' && typeof c.lon === 'number')
            .map((c) => ({
                type: 'Feature' as const,
                properties: { h3Index: c.h3Index, status: c.status, foundCount: c.foundCount || 0 },
                geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
            }));
        return features.length > 0 ? { type: 'FeatureCollection', features } : null;
    }, [cells]);

    const selectedCell = useMemo(
        () => cells.find((c) => c.h3Index === selected?.h3Index) ?? null,
        [cells, selected],
    );

    const viewport = useMemo(() => {
        const center = STATE_CENTERS[state] ?? [39.8, -98.5];
        const zoom = STATE_ZOOMS[state] ?? STATE_ZOOMS.Default;
        return {
            center: [center[1], center[0]] as [number, number],
            zoom,
            bearing: 0,
            pitch: 0,
        };
    }, [state]);

    return (
        <Map
            theme="light"
            styles={{ light: ESRI_LIGHT_GRAY_STYLE }}
            viewport={viewport}
            maxZoom={MAX_ZOOM}
            attributionControl={{ compact: true }}
            style={{ height: '100%', width: '100%' }}
        >
            <MapControls position="bottom-right" showZoom showFullscreen />
            <FitCells cells={cells} />
            {data && (
                <CellLayer
                    data={data}
                    onSelect={(index) =>
                        setSelected(
                            cells.find((c) => c.h3Index === index) ?? {
                                h3Index: index,
                                status: 'pending',
                                foundCount: 0,
                                lat: 0,
                                lon: 0,
                            },
                        )
                    }
                />
            )}

            {selectedCell && (
                <MapPopup
                    key={selectedCell.h3Index}
                    longitude={selectedCell.lon}
                    latitude={selectedCell.lat}
                    closeButton
                    className="mapcn-popup"
                    onClose={() => setSelected(null)}
                >
                    <Box className="mapcn-popup-body">
                        <Typography className="mapcn-popup-title">{selectedCell.h3Index}</Typography>
                        <Box className="mapcn-popup-row">
                            <span>Status</span>
                            <strong style={{ color: cellColor(selectedCell) }}>
                                {selectedCell.status.toUpperCase()}
                            </strong>
                        </Box>
                        <Box className="mapcn-popup-row">
                            <span>Discovery Type</span>
                            <span>County-Licensee Drilldown</span>
                        </Box>
                        {selectedCell.status === 'completed' && (
                            <Box className="mapcn-popup-row">
                                <span>Rooftops found</span>
                                <strong
                                    style={{
                                        color: (selectedCell.foundCount || 0) > 0 ? '#ff9800' : '#666',
                                        fontSize: '1.2rem',
                                    }}
                                >
                                    {selectedCell.foundCount || 0}
                                </strong>
                            </Box>
                        )}
                    </Box>
                </MapPopup>
            )}
        </Map>
    );
}
