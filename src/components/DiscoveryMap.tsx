'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, Fragment } from 'react';
import type { LatLngExpression } from 'leaflet';

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
    h3Index: string; // Used as name
    status: 'completed' | 'pending' | 'processing' | 'failed';
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
    const center = STATE_CENTERS[state] || [39.8, -98.5];
    const zoom = STATE_ZOOMS[state] || STATE_ZOOMS['Default'];

    const cellColor = (cell: MapCell) => {
        if (cell.status === 'failed') return '#f44336';
        if (cell.status === 'processing') return '#2196F3';
        if (cell.status === 'completed' && (cell.foundCount || 0) > 0) return '#ff9800'; 
        if (cell.status === 'completed') return '#111'; // Empty but done
        return 'rgba(255,255,255,0.4)'; // pending
    };

    const markers = useMemo(() => cells.map(cell => (
        <Fragment key={cell.h3Index}>
            <CircleMarker
                center={[cell.lat, cell.lon] as LatLngExpression}
                pathOptions={{
                    color: cellColor(cell),
                    fillColor: cellColor(cell),
                    fillOpacity: cell.status === 'pending' ? 0.3 : 0.8,
                    weight: 2,
                }}
                radius={cell.status === 'completed' ? 12 : 8}
            >
                <Popup>
                    <div style={{ minWidth: 150 }}>
                        <Typography variant="h6" sx={{ color: '#4CAF50', fontWeight: 900 }}>{cell.h3Index}</Typography>
                        <strong>Status: </strong>
                        <span style={{ color: cellColor(cell), fontWeight: 700 }}>
                            {cell.status.toUpperCase()}
                        </span><br />
                        <strong>Discovery Type: </strong>County-Licensee Drilldown<br />
                        {cell.status === 'completed' && (
                            <>
                                <strong>Rooftops found: </strong>
                                <span style={{ color: (cell.foundCount || 0) > 0 ? '#ff9800' : '#666', fontWeight: 900, fontSize: '1.2rem' }}>
                                    {cell.foundCount || 0}
                                end
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
            zoomControl={false}
            preferCanvas={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <FitBounds cells={cells} />
            {markers}
        </MapContainer>
    );
}

// Minimal Typography mock for the Leaflet Popup (since MUI components don't always render correctly inside Leaflet's shadow DOM)
function Typography({ children, variant, sx }: any) {
    const style = variant === 'h6' ? { fontSize: '1.1rem', marginBottom: '5px', ...sx } : sx;
    return <div style={style}>{children}</div>;
}
