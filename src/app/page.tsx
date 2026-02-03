'use client';
import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import axios from 'axios';
import { ToggleButton, ToggleButtonGroup, Paper } from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import MapIcon from '@mui/icons-material/Map';
import TowerTableSimple from '@/components/TowerTableSimple';

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
  parcel?: any;
  licensee?: string;
  status?: string;
  source?: string;
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
  const [ghostTowers, setGhostTowers] = useState<any[]>([]); // Search results
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.5, -64.0]); // Default to East Coast approximately
  const [zoom, setZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [ownerData, setOwnerData] = useState<OwnerResult | null>(null);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
  const [view, setView] = useState<'map' | 'table'>('map');
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch all towers on mount
  useEffect(() => {
    const fetchTowers = async () => {
      try {
        const res = await axios.get('/api/towers');
        setTowers(res.data);
      } catch (error) {
        console.error("Failed to fetch initial towers:", error);
      }
    };
    fetchTowers();
  }, []);

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
        // If we want to filter the list, we can. 
        // But since we want to show imported data primarily, maybe we just ADD to the list or filter?
        // For now, let's keep the user's intent: "showing on the map the locations on this import"
        // So maybe search should just move the map, not replace the list, if we are in "Import Mode"?
        // Let's implement mixed mode: Fetch, but if we have imported data, we might want to keep it.
        // Simple approach: Replace list with search results for now, 
        // but since we fetched all initially, maybe we just filter locally?
        // Actually, let's just move the map and rely on the initial fetch for now unless the user specifically searches for new towers.

        // If the API returns a filtered list, we update state.
        setTowers(towerRes.data);
      }
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };



  const handleLookupOwner = async (tower: Tower) => {
    setIsOwnerLoading(true);
    try {
      const res = await axios.get(`/api/owner?lat=${tower.lat}&lon=${tower.lon}`);
      setOwnerData(res.data);

      // Update the selected tower with the parcel data (including geometry)
      if (res.data.result?._parcel) {
        setSelectedTower({
          ...tower,
          parcel: res.data.result._parcel
        });
      }
    } catch (error) {
      console.error("Owner lookup failed:", error);
      alert("Could not fetch owner data.");
    } finally {
      setIsOwnerLoading(false);
    }
  };

  const handleBoundsChange = (bounds: any) => {
    setMapBounds(bounds);
  };

  // Search for new towers in current map bounds
  const searchTowersInArea = async () => {
    if (!mapBounds) return;

    setIsSearchLoading(true);
    try {
      const { north, south, east, west } = mapBounds;
      const res = await axios.get(`/api/search-towers?north=${north}&south=${south}&east=${east}&west=${west}`);

      // Filter out towers that are already in our DB (roughly by distance)
      const newGhostTowers = res.data.filter((ghost: any) => {
        return !towers.some(existing =>
          Math.abs(existing.lat - ghost.lat) < 0.0001 &&
          Math.abs(existing.lon - ghost.lon) < 0.0001
        );
      });

      setGhostTowers(newGhostTowers);
      if (newGhostTowers.length === 0) {
        alert("No new towers found in this area (or they are already in database).");
      }
    } catch (error) {
      console.error("Area search failed:", error);
      alert("Failed to search for towers in this area.");
    } finally {
      setIsSearchLoading(false);
    }
  };

  const handleTowerSelect = (tower: any) => {
    if (tower.isGhost) {
      if (tower.action === 'add') {
        const tempTower: Tower = {
          id: 0, // 0 indicates new/unsaved
          type: tower.type || 'Unknown',
          lat: tower.lat,
          lon: tower.lon,
          status: 'New',
          source: 'Tower Finder'
        };
        setSelectedTower(tempTower);
        setOwnerData(null);
        alert("Selected! Click 'Get Land Owner' in the sidebar to save this tower and fetch details.");
      } else {
        const tempTower: Tower = {
          id: 0, // 0 indicates new/unsaved
          type: tower.type || 'Unknown',
          lat: tower.lat,
          lon: tower.lon,
          status: 'New',
          source: 'Tower Finder'
        };
        setSelectedTower(tempTower);
        setOwnerData(null);
      }
    } else {
      setSelectedTower(tower);
      setOwnerData(null);
    }
  };

  const handleViewChange = (
    event: React.MouseEvent<HTMLElement>,
    newView: 'map' | 'table',
  ) => {
    if (newView !== null) {
      setView(newView);
      // When switching to map view and there's a selected tower, center on it
      if (newView === 'map' && selectedTower) {
        setMapCenter([selectedTower.lat, selectedTower.lon]);
        setZoom(15); // Closer zoom to see the tower
      }
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          onSearch={handleSearch}
          isLoading={isLoading}
          results={towers} // Shows list in sidebar too
          selectedTower={selectedTower}
          onLookupOwner={handleLookupOwner}
          isOwnerLoading={isOwnerLoading}
          ownerData={ownerData}
        />

        <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>

          {/* View Toggle */}
          <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
            <Paper elevation={3}>
              <ToggleButtonGroup
                value={view}
                exclusive
                onChange={handleViewChange}
                aria-label="view toggle"
                size="small"
              >
                <ToggleButton value="map" aria-label="map view">
                  <MapIcon />
                </ToggleButton>
                <ToggleButton value="table" aria-label="table view">
                  <ViewListIcon />
                </ToggleButton>
              </ToggleButtonGroup>
            </Paper>
          </Box>

          {view === 'map' ? (
            mounted ? (
              <Map
                center={mapCenter}
                zoom={zoom}
                towers={towers}
                onTowerSelect={handleTowerSelect}
                selectedTower={selectedTower}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                Loading Map...
              </Box>
            )
          ) : (
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <TowerTableSimple towers={towers} onRowSelect={handleTowerSelect} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
