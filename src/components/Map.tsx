'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from 'react-leaflet';
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
        geometry?: any;
        [key: string]: any;
    };
    details?: any;
}

interface MapProps {
    center: [number, number];
    zoom: number;
    towers: Tower[];
    onTowerSelect: (tower: Tower) => void;
    selectedTower?: Tower | null;
}

// Helper function to convert GeoJSON geometry to Leaflet coordinates
function geometryToLeafletCoords(geometry: any): LatLngExpression[] | LatLngExpression[][] | null {
    if (!geometry || !geometry.coordinates) return null;

    try {
        if (geometry.type === 'Polygon') {
            // Polygon coordinates are [[[lon, lat], [lon, lat], ...]]
            return geometry.coordinates[0].map((coord: number[]) => [coord[1], coord[0]] as LatLngExpression);
        } else if (geometry.type === 'MultiPolygon') {
            // MultiPolygon - use the first polygon
            return geometry.coordinates[0][0].map((coord: number[]) => [coord[1], coord[0]] as LatLngExpression);
        }
    } catch (error) {
        console.error('[Map] Error converting geometry:', error);
    }

    return null;
}

export default function Map({ center, zoom, towers, onTowerSelect, selectedTower }: MapProps) {

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

            {/* Draw parcel polygon for selected tower */}
            {selectedTower && selectedTower.parcel?.geometry && (() => {
                const coords = geometryToLeafletCoords(selectedTower.parcel.geometry);
                if (coords) {
                    return (
                        <Polygon
                            positions={coords}
                            pathOptions={{
                                color: '#2196f3',
                                fillColor: '#2196f3',
                                fillOpacity: 0.2,
                                weight: 2
                            }}
                        />
                    );
                }
                return null;
            })()}

            {towers && towers.map(tower => (
                <CircleMarker
                    key={tower.id}
                    center={[tower.lat, tower.lon] as LatLngExpression}
                    pathOptions={{
                        color: selectedTower?.id === tower.id ? '#2196f3' : 'red',
                        fillColor: selectedTower?.id === tower.id ? '#2196f3' : '#f00',
                        fillOpacity: 0.5
                    }}
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
