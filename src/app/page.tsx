'use client';
import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import axios from 'axios';

// Dynamically import Map to avoid SSR issues with Leaflet
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <p>Loading Map...</p>
});

interface Tower {
  id: number;
  type: string;
  subType?: string;
  lat: number;
  lon: number;
  details?: any;
}

interface OwnerResult {
  result: {
    owner: string;
    address: string;
    parcel_id: string;
    geometry: any;
    [key: string]: any;
  } | null;
}

export default function Home() {
  const [towers, setTowers] = useState<Tower[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // US Center
  const [zoom, setZoom] = useState<number>(4);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [ownerData, setOwnerData] = useState<OwnerResult | null>(null);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    try {
      // 1. Geocode the location
      const geoRes = await axios.get(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (geoRes.data && geoRes.data.length > 0) {
        const bestMatch = geoRes.data[0];
        const lat = parseFloat(bestMatch.lat);
        const lon = parseFloat(bestMatch.lon);

        // Update map view
        setMapCenter([lat, lon]);
        setZoom(13); // Closer zoom for city/area

        // 2. Search for towers in the viewport (approximate bbox for now)
        // Creating a roughly 0.1 degree box around the point
        const offset = 0.05;
        const bbox = `${lat - offset},${lon - offset},${lat + offset},${lon + offset}`;

        const towerRes = await axios.get(`/api/towers?bbox=${bbox}`);
        setTowers(towerRes.data);
      }
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTowerSelect = (tower: Tower) => {
    setSelectedTower(tower);
    setOwnerData(null); // Reset owner data when new tower is selected
  };

  const handleLookupOwner = async (tower: Tower) => {
    setIsOwnerLoading(true);
    try {
      const res = await axios.get(`/api/owner?lat=${tower.lat}&lon=${tower.lon}`);
      setOwnerData(res.data);
    } catch (error) {
      console.error("Owner lookup failed:", error);
      alert("Could not fetch owner data.");
    } finally {
      setIsOwnerLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        onSearch={handleSearch}
        isLoading={isLoading}
        results={towers}
        selectedTower={selectedTower}
        onLookupOwner={handleLookupOwner}
        isOwnerLoading={isOwnerLoading}
        ownerData={ownerData}
      />

      <Box sx={{ flex: 1, position: 'relative' }}>
        <Map
          center={mapCenter}
          zoom={zoom}
          towers={towers}
          onTowerSelect={handleTowerSelect}
        />
      </Box>
    </Box>
  );
}
