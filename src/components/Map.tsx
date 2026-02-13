'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
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
    type?: { name: string } | string;
    subType?: string;
    lat: number;
    lon: number;
    licensee?: { name: string } | string;
    carrier?: { name: string } | string;
    status?: string;
    source?: string;
    googleMapsUrl?: string;
    parcel?: {
        address?: string;
        geometry?: any;
        cityRaw?: string;
        stateRaw?: string;
        provinceRaw?: string;
        city?: { name: string } | string;
        province?: { name: string } | string;
        [key: string]: any;
    };
    details?: any;
}

interface MapProps {
    center: [number, number];
    zoom: number;
    towers: Tower[];
    towerLeads?: any[]; // Leads from local DB
    onTowerSelect: (tower: Tower | any) => void;
    selectedTower?: Tower | null;
    onBoundsChange?: (bounds: { north: number, south: number, east: number, west: number }) => void;
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

// Component to handle map events like move end
function MapEvents({ onBoundsChange }: { onBoundsChange?: (bounds: any) => void }) {
    const map = useMap();

    useEffect(() => {
        if (!onBoundsChange) return;

        const updateBounds = () => {
            const bounds = map.getBounds();
            onBoundsChange({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
            });
        };

        map.on('moveend', updateBounds);
        updateBounds(); // Initial call

        return () => {
            map.off('moveend', updateBounds);
        };
    }, [map, onBoundsChange]);

    return null;
}

export default function Map({ center, zoom, towers, towerLeads = [], onTowerSelect, selectedTower, onBoundsChange }: MapProps) {

    // Debug logging for selected tower geometry
    useEffect(() => {
        if (selectedTower) {
            console.log('[Map] Selected tower:', selectedTower.id);
            // Only toggle logs if not too noisy
            // console.log('[Map] Has parcel:', !!selectedTower.parcel);
        }
    }, [selectedTower]);

    return (
        // @ts-ignore - MapContainer types can be finicky in strict mode sometimes
        <MapContainer
            center={center as LatLngExpression}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            preferCanvas={true}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapUpdater center={center as LatLngExpression} zoom={zoom} />
            <MapEvents onBoundsChange={onBoundsChange} />

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

            {/* Existing Towers (Red) - Clustered */}
            <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={50}
                spiderfyOnMaxZoom={true}
                showCoverageOnHover={false}
                zoomToBoundsOnClick={true}
                iconCreateFunction={(cluster) => {
                    const count = cluster.getChildCount();
                    return L.divIcon({
                        html: `<div style="background-color: #f44336; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid #c62828; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${count}</div>`,
                        className: 'tower-cluster-icon',
                        iconSize: L.point(40, 40)
                    });
                }}
            >
                {towers && towers.map(tower => (
                    <CircleMarker
                        key={`tower-${tower.id}`}
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
                                <strong>{typeof tower.type === 'object' ? tower.type?.name : (tower.type || 'Tower')}</strong><br />
                                {tower.licensee && <><strong>Licensee:</strong> {typeof tower.licensee === 'object' ? tower.licensee?.name : tower.licensee}<br /></>}
                                {tower.parcel?.address && <><strong>Address:</strong> {tower.parcel.address}<br /></>}
                                <strong>Coordinates:</strong> {tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}<br />
                                <strong>Status:</strong> {tower.status || 'Unknown'}<br />
                                <small style={{ color: '#666' }}>Source: {tower.source || 'Excel Import'}</small>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MarkerClusterGroup>

            {/* Tower Leads (Green) - Clustered */}
            <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={40}
                spiderfyOnMaxZoom={true}
                showCoverageOnHover={false}
                zoomToBoundsOnClick={true}
                iconCreateFunction={(cluster) => {
                    const count = cluster.getChildCount();
                    return L.divIcon({
                        html: `<div style="background-color: #4CAF50; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid #2E7D32; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${count}</div>`,
                        className: 'lead-cluster-icon',
                        iconSize: L.point(40, 40)
                    });
                }}
            >
                {towerLeads && towerLeads.map(lead => (
                    <CircleMarker
                        key={`lead-${lead.id}`}
                        center={[lead.lat, lead.lon] as LatLngExpression}
                        pathOptions={{
                            color: '#4CAF50',
                            fillColor: '#66BB6A',
                            fillOpacity: 0.6,
                            dashArray: '5, 5'
                        }}
                        radius={8}
                        eventHandlers={{
                            click: () => onTowerSelect({ ...lead, isLead: true })
                        }}
                    >
                        <Popup>
                            <div style={{ minWidth: '200px' }}>
                                <strong>Tower Lead</strong><br />
                                <strong>Source:</strong> {lead.source || 'Unknown'}<br />
                                <strong>Type:</strong> {lead.type || 'Unknown'}<br />
                                <strong>Coordinates:</strong> {lead.lat.toFixed(6)}, {lead.lon.toFixed(6)}<br />
                                <br />
                                <button
                                    style={{
                                        backgroundColor: '#4CAF50',
                                        color: 'white',
                                        border: 'none',
                                        padding: '5px 10px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        width: '100%'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTowerSelect({ ...lead, isLead: true, action: 'promote' });
                                    }}
                                >
                                    Add to Towers
                                </button>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MarkerClusterGroup>
        </MapContainer>
    );
}
