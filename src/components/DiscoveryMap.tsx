'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, Fragment } from 'react';
import type { LatLngExpression } from 'leaflet';

// ... (previous state arrays)
const STATE_CENTERS: Record<string, [number, number]> = {
    'Illinois': [40.0, -89.0],
    'Texas': [31.0, -100.0],
    'California': [37.0, -120.0],
    'New York': [43.0, -75.0],
    'Florida': [28.0, -82.0],
};

const STATE_ZOOMS: Record<string, number> = {
    'Illinois': 7,
    'Texas': 6,
    'California': 6,
    'Default': 7,
};

interface MapCell {
    lat: number;
    lon: number;
    h3Index: string;
    status: 'completed' | 'pending' | 'failed';
    foundCount: number;
}

function FitBounds({ cells }: { cells: MapCell[] }) {
    const map = useMap();

    useEffect(() => {
        if (cells.length === 0) return;

        const lats = cells.map(c => c.lat);
        const lons = cells.map(c => c.lon);
        const bounds = L.latLngBounds(
            [Math.min(...lats), Math.min(...lons)],
            [Math.max(...lats), Math.max(...lons)]
        );
        map.fitBounds(bounds, { padding: [30, 30] });
    }, [cells, map]);

    return null;
}

export default function DiscoveryMap({ cells, state }: { cells: MapCell[]; state: string }) {
    const center = STATE_CENTERS[state] || [39.8, -98.5]; // USA center fallback
    const zoom = STATE_ZOOMS[state] || STATE_ZOOMS['Default'];

    const cellColor = (cell: MapCell) => {
        if (cell.status === 'failed') return '#f44336';
        if (cell.status === 'completed' && cell.foundCount > 0) return '#ff9800';
        if (cell.status === 'completed') return '#4CAF50';
        return 'rgba(255,255,255,0.4)'; // pending
    };

    const cellOpacity = (cell: MapCell) => {
        if (cell.status === 'pending') return 0.2;
        if (cell.status === 'completed' && cell.foundCount > 0) return 0.9;
        return 0.5;
    };

    // Memoize markers to avoid re-rendering 4000+ circles on every parent render
    const markers = useMemo(() => cells.map(cell => (
        <Fragment key={cell.h3Index}>
            {/* 1-Mile Search Radius Visualizer (only for non-pending or low-opacity aura) */}
            <Circle
                center={[cell.lat, cell.lon] as LatLngExpression}
                radius={1609.34} // EXACT 1 Mile in meters
                pathOptions={{
                    fillColor: cellColor(cell),
                    fillOpacity: cell.status === 'pending' ? 0.01 : 0.03, // Subtlest ghosting for coverage gaps
                    weight: 0,
                    stroke: false
                }}
            />
            <CircleMarker
                center={[cell.lat, cell.lon] as LatLngExpression}
                pathOptions={{
                    color: cellColor(cell),
                    fillColor: cellColor(cell),
                    fillOpacity: cellOpacity(cell),
                    weight: cell.status === 'pending' ? 0.5 : 1.5,
                }}
                radius={cell.status === 'completed' ? (cell.foundCount > 0 ? 6 : 4) : 3}
            >
                <Popup>
                    <div style={{ minWidth: 150 }}>
                        <strong>Cell: </strong>{cell.h3Index}<br />
                        <strong>Status: </strong>
                        <span style={{ color: cellColor(cell), fontWeight: 700 }}>
                            {cell.status.toUpperCase()}
                        </span><br />
                        <strong>Search Radius: </strong>1.0 Mile<br />
                        <strong>Coordinates: </strong>{cell.lat.toFixed(4)}, {cell.lon.toFixed(4)}<br />
                        {cell.status === 'completed' && (
                            <>
                                <strong>Leads found: </strong>
                                <span style={{ color: cell.foundCount > 0 ? '#ff9800' : '#666', fontWeight: 700 }}>
                                    {cell.foundCount}
                                </span>
                            </>
                        )}
                    </div>
                </Popup>
            </CircleMarker>
        </Fragment>
    )), [cells]);

    return (
        <MapContainer
            center={center as LatLngExpression}
            zoom={zoom}
            style={{ height: '100%', width: '100%', minHeight: 500 }}
            zoomControl={true}
            preferCanvas={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <FitBounds cells={cells} />
            {markers}
        </MapContainer>
    );
}
