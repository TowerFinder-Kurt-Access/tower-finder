'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef, MapViewport } from '@/components/ui/map';
import {
    Map,
    MapClusterLayer,
    MapControls,
    MapGeoJSON,
    MapMarker,
    MarkerContent,
    MapPopup,
    useMap,
} from '@/components/ui/map';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import type { GeoJSON } from 'geojson';
import { toLngLat, type MapBounds } from '@/lib/map-viewport';
import {
    ESRI_LIGHT_GRAY_STYLE,
    LEAD_CLUSTER_COLORS,
    LEAD_POINT_COLOR,
    TOWER_CLUSTER_COLORS,
    TOWER_POINT_COLOR,
} from '@/components/ui/cluster-styles';

/** Hysteresis pad. While the viewport stays inside the last reported area,
 *  no new bounds go out. Zooming in always satisfies this, so a cluster
 *  drill-in never triggers a refetch that would wipe markers. */
const BOUNDS_PAD = 0.6;

/** Zoom ceiling of the Esri basemap. Past this the tiles are blank. */
const MAX_ZOOM = 18;

export interface MapTower {
    id: number;
    type?: { name: string } | string;
    subType?: string;
    lat: number;
    lon: number;
    carrier?: { name: string } | string;
    status?: string;
    source?: string;
    parcel?: {
        address?: string;
        geometry?: unknown;
        [key: string]: unknown;
    };
    details?: unknown;
}

export interface MapLead {
    id: number;
    lat: number;
    lon: number;
    source?: string;
    type?: string;
    city?: string;
    country?: string;
    promotedToTowerId?: number | null;
}

export interface MapBusiness {
    id: number;
    name: string;
    phone: string | null;
    distance: number;
    rawData?: unknown;
}

interface TowerFeatureProps {
    towerId: number;
    selected: boolean;
    isLead: boolean;
}

type TowerFeature = GeoJSON.Feature<GeoJSON.Point, TowerFeatureProps>;

/** Shared empty collection, so an empty dataset keeps a stable reference. */
const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection<GeoJSON.Point, TowerFeatureProps> = {
    type: 'FeatureCollection',
    features: [],
};

/** Read a business coordinate out of its stored GeoJSON or properties. */
function businessCoords(biz: MapBusiness): [number, number] | null {
    const raw = biz.rawData as { geometry?: { coordinates?: unknown } } | undefined;
    const coords = raw?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
        const lon = coords[0] as number;
        const lat = coords[1] as number;
        if (typeof lon === 'number' && typeof lat === 'number') return [lat, lon];
    }
    const props = (biz.rawData as { properties?: { lat?: number; lon?: number } } | undefined)?.properties;
    if (props && typeof props.lat === 'number' && typeof props.lon === 'number') {
        return [props.lat, props.lon];
    }
    return null;
}

/** Business coordinates as a GeoJSON point, in MapLibre order. */
function businessPoint(biz: MapBusiness): GeoJSON.Feature<GeoJSON.Point> | null {
    const c = businessCoords(biz);
    if (!c) return null;
    return {
        type: 'Feature',
        properties: { id: biz.id },
        geometry: { type: 'Point', coordinates: [c[1], c[0]] },
    };
}

/**
 * Convert ArcGIS ring or GeoJSON polygon geometry into a GeoJSON polygon.
 *
 * ArcGIS rings are `[[lon, lat], ...]` and already match GeoJSON order. GeoJSON
 * polygons are `[[[lon, lat], ...]]`, so the outer ring is taken as-is.
 */
export function geometryToGeoJSON(geometry: unknown): GeoJSON.Feature<GeoJSON.Polygon> | null {
    if (!geometry || typeof geometry !== 'object') return null;

    const g = geometry as { rings?: unknown; coordinates?: unknown; type?: unknown };
    const empty = (): GeoJSON.Feature<GeoJSON.Polygon> => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [] },
    });

    try {
        if (Array.isArray(g.rings) && g.rings.length > 0) {
            const ring = g.rings[0];
            if (!Array.isArray(ring)) return empty();
            return {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [ring as number[][]] },
            };
        }

        if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
            return {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [g.coordinates[0] as number[][]] },
            };
        }
        if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
            const first = (g.coordinates as number[][][][])[0];
            if (!first) return empty();
            return {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [first[0]] },
            };
        }
    } catch (error) {
        console.error('[TowerMap] Error converting geometry:', error);
    }

    return null;
}

function towerLabel(type: MapTower['type']): string {
    if (typeof type === 'object' && type) return type.name || 'Tower';
    return (type as string | undefined) || 'Tower';
}

function statusLabel(status: MapTower['status']): string {
    if (typeof status === 'object' && status) {
        return (status as { name?: string }).name || 'Unknown';
    }
    return status || 'Unknown';
}

/** Report bounds on moveend, with the same hysteresis the Leaflet stack used. */
function BoundsReporter({ onBoundsChange }: { onBoundsChange?: (bounds: MapBounds) => void }) {
    const map = useMap().map;

    useEffect(() => {
        if (!map || !onBoundsChange) return;

        let reported: { north: number; south: number; east: number; west: number } | null = null;

        const report = () => {
            const viewport = map.getBounds();
            const next = {
                north: viewport.getNorth(),
                south: viewport.getSouth(),
                east: viewport.getEast(),
                west: viewport.getWest(),
            };
            if (reported) {
                // Inside the last reported area: keep quiet. Zooming in always
                // fails this test, so a cluster drill-in still reports.
                const inside =
                    next.north <= reported.north &&
                    next.south >= reported.south &&
                    next.east <= reported.east &&
                    next.west >= reported.west;
                if (inside) return;
            }
            // Pad before storing, so the next comparison uses the same area.
            const latPad = (next.north - next.south) * BOUNDS_PAD;
            const lonPad = (next.east - next.west) * BOUNDS_PAD;
            reported = {
                north: next.north + latPad,
                south: next.south - latPad,
                east: next.east + lonPad,
                west: next.west - lonPad,
            };
            onBoundsChange(reported);
        };

        map.on('moveend', report);
        report();

        return () => {
            map.off('moveend', report);
        };
    }, [map, onBoundsChange]);

    return null;
}

/**
 * Nearby businesses as a plain circle layer.
 *
 * These are few (a few dozen at most), so a cluster is not needed. `MapGeoJSON`
 * only draws fill and line layers, which cannot render a point, so the circle
 * layer is managed directly through `useMap`.
 */
function BusinessPointsLayer({
    data,
    onSelect,
}: {
    data: GeoJSON.FeatureCollection<GeoJSON.Point>;
    onSelect?: (id: number) => void;
}) {
    const { map, isLoaded } = useMap();
    const sourceId = 'nearby-businesses-source';
    const layerId = 'nearby-businesses-layer';

    useEffect(() => {
        if (!isLoaded || !map) return;

        map.addSource(sourceId, { type: 'geojson', data, promoteId: 'id' });
        map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
                'circle-color': '#9c27b0',
                'circle-radius': 5,
                'circle-stroke-width': 1,
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
        if (!isLoaded || !map || !onSelect) return;

        const handleClick = (e: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
            const id = e.features?.[0]?.properties?.id;
            if (typeof id === 'number') onSelect(id);
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

export interface TowerMapProps {
    center: [number, number];
    zoom: number;
    bounds?: [[number, number], [number, number]];
    towers: MapTower[];
    towerLeads?: MapLead[];
    businessesNearby?: MapBusiness[];
    onTowerSelect: (tower: MapTower | (MapLead & { isLead?: boolean; action?: string })) => void;
    selectedTower?: MapTower | null;
    selectedBusinessId?: number | null;
    onBusinessSelect?: (id: number) => void;
    onBoundsChange?: (bounds: MapBounds) => void;
    /** Toggle GPS tracking from the map's locate control. */
    onLocate?: () => void;
    userPosition?: { lat: number; lon: number; accuracy?: number } | null;
}

export default function TowerMap({
    center,
    zoom,
    bounds,
    towers,
    towerLeads = [],
    businessesNearby = [],
    onTowerSelect,
    selectedTower,
    selectedBusinessId,
    onBusinessSelect,
    onBoundsChange,
    onLocate,
    userPosition,
}: TowerMapProps) {
    const mapRef = useRef<MapRef | null>(null);

    // The map is uncontrolled after the first paint. The page's `center` and
    // `zoom` props say where to start and where to jump when the user picks a
    // tower. If they stayed authoritative, every re-render would snap the map
    // back to a stale zoom and fight the user's own zooming.
    //
    // `navTarget` is the only thing that moves the map after mount: a new tower
    // selection or an explicit centre change from the page.
    const navTarget = useMemo(
        () => ({ center: toLngLat(center[0], center[1]), zoom }),
        [center, zoom],
    );

    const lastNavRef = useRef(navTarget);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (lastNavRef.current === navTarget) return;

        const previous = lastNavRef.current;
        lastNavRef.current = navTarget;

        // The page changed `zoom` on purpose (a URL param, a GPS fix): honour it.
        // If only the centre changed (a tower click), pan at the live zoom so the
        // user's chosen zoom level survives.
        const pageChangedZoom = previous.zoom !== navTarget.zoom;
        map.easeTo({
            center: navTarget.center,
            zoom: pageChangedZoom ? navTarget.zoom : map.getZoom(),
            duration: 600,
        });
    }, [navTarget]);

    // Only the initial viewport is controlled. After mount the map owns its own
    // camera, so user zoom and pan are never reverted. Computed once, not per
    // render, because `Map` reads this on mount only.
    const [initialViewport] = useState<Partial<MapViewport>>(() => ({
        center: toLngLat(center[0], center[1]),
        zoom,
        bearing: 0,
        pitch: 0,
    }));

    // `bounds` asks the map to fit a rectangle. The page sets it when a province
    // or a country is chosen, then clears it.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !bounds) return;
        const [[south, west], [north, east]] = bounds;
        map.fitBounds(
            [
                [west, south],
                [east, north],
            ],
            { padding: 50, duration: 800 },
        );
    }, [bounds]);

    // The selected business opens its popup by centering on it. The popup
    // itself is rendered from `selectedBusinessId` below.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || selectedBusinessId == null) return;
        const biz = businessesNearby.find((b) => b.id === selectedBusinessId);
        const c = biz ? businessCoords(biz) : null;
        if (!c) return;
        map.easeTo({ center: [c[1], c[0]], duration: 600 });
    }, [selectedBusinessId, businessesNearby]);

    const towerFeatures = useMemo<TowerFeature[]>(
        () =>
            towers
                .filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number')
                .map((t) => ({
                    type: 'Feature',
                    properties: {
                        towerId: t.id,
                        selected: selectedTower?.id === t.id,
                        isLead: false,
                    },
                    geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
                })),
        [towers, selectedTower],
    );

    const leadFeatures = useMemo<TowerFeature[]>(
        () =>
            towerLeads
                .filter((l) => !l.promotedToTowerId && typeof l.lat === 'number' && typeof l.lon === 'number')
                .map((l) => ({
                    type: 'Feature',
                    properties: {
                        towerId: l.id,
                        selected: false,
                        isLead: true,
                    },
                    geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
                })),
        [towerLeads],
    );

    const towerById = useMemo(
        () => new globalThis.Map<number, MapTower>(towers.map((t) => [t.id, t])),
        [towers],
    );
    const leadById = useMemo(
        () => new globalThis.Map<number, MapLead>(towerLeads.map((l) => [l.id, l])),
        [towerLeads],
    );

    const handlePointClick = useCallback(
        (feature: GeoJSON.Feature<GeoJSON.Point, TowerFeatureProps>) => {
            const { towerId, isLead } = feature.properties;
            if (isLead) {
                const lead = leadById.get(towerId);
                if (lead) onTowerSelect({ ...lead, isLead: true });
                return;
            }
            const tower = towerById.get(towerId);
            if (tower) onTowerSelect(tower);
        },
        [leadById, towerById, onTowerSelect],
    );

    // Clicking a cluster drills in. The default MapLibre expansion zoom is
    // correct, so no custom rule is needed here.
    const parcel = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon> | null>(() => {
        if (!selectedTower?.parcel?.geometry) return null;
        const feature = geometryToGeoJSON(selectedTower.parcel.geometry);
        if (!feature) return null;
        return { type: 'FeatureCollection', features: [feature] };
    }, [selectedTower]);

    const businessFeatures = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(() => {
        const features = businessesNearby
            .map(businessPoint)
            .filter((f): f is GeoJSON.Feature<GeoJSON.Point> => f !== null);
        return features.length > 0 ? { type: 'FeatureCollection', features } : null;
    }, [businessesNearby]);

    const selectedBusiness = useMemo(
        () => businessesNearby.find((b) => b.id === selectedBusinessId) ?? null,
        [businessesNearby, selectedBusinessId],
    );
    const selectedBusinessCoords = selectedBusiness ? businessCoords(selectedBusiness) : null;

    return (
        <Map
            ref={mapRef}
            theme="light"
            styles={{ light: ESRI_LIGHT_GRAY_STYLE }}
            viewport={initialViewport}
            maxZoom={MAX_ZOOM}
            attributionControl={{ compact: true }}
            style={{ height: '100%', width: '100%' }}
        >
            <BoundsReporter onBoundsChange={onBoundsChange} />

            <MapControls
                position="bottom-right"
                showZoom
                showLocate
                showFullscreen
                onLocate={() => onLocate?.()}
            />

            {/* Tower clusters */}
            <MapClusterLayer<TowerFeatureProps>
                data={towerFeatures.length > 0 ? { type: 'FeatureCollection', features: towerFeatures } : EMPTY_FEATURE_COLLECTION}
                clusterRadius={50}
                clusterMaxZoom={MAX_ZOOM}
                clusterColors={[...TOWER_CLUSTER_COLORS]}
                clusterThresholds={[100, 750]}
                pointColor={TOWER_POINT_COLOR}
                onPointClick={handlePointClick}
            />

            {/* Tower lead clusters */}
            <MapClusterLayer<TowerFeatureProps>
                data={leadFeatures.length > 0 ? { type: 'FeatureCollection', features: leadFeatures } : EMPTY_FEATURE_COLLECTION}
                clusterRadius={40}
                clusterMaxZoom={MAX_ZOOM}
                clusterColors={[...LEAD_CLUSTER_COLORS]}
                clusterThresholds={[100, 750]}
                pointColor={LEAD_POINT_COLOR}
                onPointClick={handlePointClick}
            />

            {/* Nearby businesses. They are few and small, so a plain circle layer
                beats a cluster. */}
            {businessFeatures && (
                <BusinessPointsLayer data={businessFeatures} onSelect={onBusinessSelect} />
            )}

            {/* Selected tower parcel outline */}
            {parcel && (
                <MapGeoJSON
                    id="selected-parcel"
                    data={parcel}
                    fillPaint={{ 'fill-color': '#2196f3', 'fill-opacity': 0.2 }}
                    linePaint={{ 'line-color': '#2196f3', 'line-width': 2 }}
                />
            )}

            {/* Selected tower marker and popup */}
            {selectedTower && typeof selectedTower.lat === 'number' && (
                <MapMarker
                    longitude={selectedTower.lon}
                    latitude={selectedTower.lat}
                    onClick={() => onTowerSelect(selectedTower)}
                >
                    <MarkerContent>
                        <Box className="mapcn-marker-selected" />
                    </MarkerContent>
                </MapMarker>
            )}

            {selectedTower && (
                <MapPopup
                    key={`tower-popup-${selectedTower.id}`}
                    longitude={selectedTower.lon}
                    latitude={selectedTower.lat}
                    closeButton
                    className="mapcn-popup"
                    onClose={() => onTowerSelect(selectedTower)}
                >
                    <Box className="mapcn-popup-body">
                        <Typography className="mapcn-popup-title">{towerLabel(selectedTower.type)}</Typography>
                        <Box className="mapcn-popup-row">
                            <span>ID</span>
                            <strong>{selectedTower.id}</strong>
                        </Box>
                        {selectedTower.parcel?.address && (
                            <Box className="mapcn-popup-row">
                                <span>Address</span>
                                <span style={{ textAlign: 'right' }}>{String(selectedTower.parcel.address)}</span>
                            </Box>
                        )}
                        <Box className="mapcn-popup-row">
                            <span>Status</span>
                            <strong>{statusLabel(selectedTower.status)}</strong>
                        </Box>
                        <Box className="mapcn-popup-row">
                            <span>Coordinates</span>
                            <strong>
                                {selectedTower.lat.toFixed(5)}, {selectedTower.lon.toFixed(5)}
                            </strong>
                        </Box>
                        <Box className="mapcn-popup-row">
                            <span>Source</span>
                            <span>{selectedTower.source || 'Excel Import'}</span>
                        </Box>
                        <Box className="mapcn-popup-actions">
                            <Button
                                size="small"
                                variant="contained"
                                fullWidth
                                sx={{
                                    bgcolor: '#ff9800',
                                    '&:hover': { bgcolor: '#f57c00' },
                                    textTransform: 'none',
                                    fontSize: 12,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTowerSelect({ ...selectedTower, action: 'addOwner' } as MapTower);
                                }}
                            >
                                Add Property Owner
                            </Button>
                        </Box>
                    </Box>
                </MapPopup>
            )}

            {/* Selected business popup */}
            {selectedBusiness && selectedBusinessCoords && (
                <MapPopup
                    key={`biz-popup-${selectedBusiness.id}`}
                    longitude={selectedBusinessCoords[1]}
                    latitude={selectedBusinessCoords[0]}
                    closeButton
                    className="mapcn-popup"
                >
                    <Box className="mapcn-popup-body">
                        <Typography className="mapcn-popup-title">{selectedBusiness.name}</Typography>
                        <Box className="mapcn-popup-row">
                            <span>Type</span>
                            <span>Business</span>
                        </Box>
                        <Box className="mapcn-popup-row">
                            <span>Distance</span>
                            <strong>{Math.round(selectedBusiness.distance)}m</strong>
                        </Box>
                        {selectedBusiness.phone && (
                            <Box className="mapcn-popup-row">
                                <span>Phone</span>
                                <strong>{selectedBusiness.phone}</strong>
                            </Box>
                        )}
                    </Box>
                </MapPopup>
            )}

            {/* GPS position */}
            {userPosition && (
                <MapMarker
                    longitude={userPosition.lon}
                    latitude={userPosition.lat}
                    draggable={false}
                >
                    <MarkerContent>
                        <Box className="mapcn-marker-user" />
                    </MarkerContent>
                </MapMarker>
            )}
        </Map>
    );
}
