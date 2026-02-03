'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import type { LatLngExpression } from 'leaflet';

// Component to handle map center updates
function MapUpdater({ center, zoom }: { center: LatLngExpression, zoom: number }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, zoom || 13, { duration: 2 });
        }
    }, [center, zoom, map]);
    return null;
}

interface Tower {
    id: number;
    type: string;
    subType?: string;
    lat: number;
    lon: number;
    licensee?: string;
    status?: string;
    googleMapsUrl?: string;
    parcel?: {
        address?: string;
        [key: string]: any;
    };
    details?: any;
}

interface MapProps {
    center: [number, number];
    zoom: number;
    towers: Tower[];
    onTowerSelect: (tower: Tower) => void;
}

export default function Map({ center, zoom, towers, onTowerSelect }: MapProps) {

    return (
        // @ts-ignore - MapContainer types can be finicky in strict mode sometimes
        <MapContainer
            center={center as LatLngExpression}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapUpdater center={center as LatLngExpression} zoom={zoom} />

            {towers && towers.map(tower => (
                <CircleMarker
                    key={tower.id}
                    center={[tower.lat, tower.lon] as LatLngExpression}
                    pathOptions={{ color: 'red', fillColor: '#f00', fillOpacity: 0.5 }}
                    radius={10}
                    eventHandlers={{
                        click: () => onTowerSelect(tower)
                    }}
                >
                    <Popup>
                        <div style={{ minWidth: '200px' }}>
                            <strong>{tower.type || 'Tower'}</strong><br />
                            {tower.licensee && <><strong>Licensee:</strong> {tower.licensee}<br /></>}
                            {tower.parcel?.address && <><strong>Address:</strong> {tower.parcel.address}<br /></>}
                            <strong>Coordinates:</strong> {tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}<br />
                            <strong>Status:</strong> {tower.status || 'Unknown'}
                        </div>
                    </Popup>
                </CircleMarker>
            ))}
        </MapContainer>
    );
}
