'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import Box from '@mui/material/Box';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import axios from 'axios';
import { Paper } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
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

function HomeContent() {
  const router = useRouter();
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
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  const searchParams = useSearchParams();

  // Effect to handle URL params for selecting a tower (e.g., coming from Owners page)
  useEffect(() => {
    const towerId = searchParams.get('selectTower');
    if (towerId) {
      const fetchAndSelectTower = async () => {
        setIsLoading(true);
        try {
          // We need to fetch this specific tower. 
          // Currently our API fetches lists. Let's filter by ID if possible or just fetch all for that state if we knew it.
          // Since we don't know the state, we might need a specific get-by-id endpoint or filter.

          // Workaround: Fetch all (expensive?) or implement get-by-id.
          // Let's implement a simple get-by-id logic here if we can't search easily.
          // Actually, let's assume the user wants to see it on the map.
          // We can fetch just that tower to show it.

          // Better: The map expects a list of towers to render markers.
          // So we should setTowers([thatOneTower]).

          // We need an endpoint for retrieving a single tower or support ?id=...
          // Let's try to query our towers API.

          // Assuming we don't have a direct ID endpoint yet, fail gracefully or improve API.
          // For now, let's try to find it in the current list if loaded, else warn.
          // Actually, let's upgrade the API to support ?id= param.

          const res = await axios.get(`/api/towers?id=${towerId}`); // We will need to support this in API
          if (res.data && res.data.length > 0) {
            const tower = res.data[0];
            setTowers([tower]); // Show only this tower? Or append? Let's show only this for clarity.
            setSelectedTower(tower);
            setMapCenter([tower.lat, tower.lon]);
            setZoom(14);
          }
        } catch (error) {
          console.error("Failed to load selected tower:", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchAndSelectTower();
    }
  }, [searchParams]);

  // Fetch towers on mount? NO, user wants to filter first to avoid thousands.
  // We will load a small batch or nothing. 
  // Let's load nothing or maybe just a "Please select a state" message.

  // Helper to calculate center
  const calculateCenter = (points: Tower[]): [number, number] => {
    if (points.length === 0) return [46.5, -64.0];
    const totalLat = points.reduce((sum, p) => sum + p.lat, 0);
    const totalLon = points.reduce((sum, p) => sum + p.lon, 0);
    return [totalLat / points.length, totalLon / points.length];
  };

  // ...

  const handleStateSelect = async (state: string) => {
    setIsLoading(true);
    try {
      if (!state) {
        setTowers([]);
        setIsLoading(false);
        return;
      }

      const res = await axios.get(`/api/towers?state=${encodeURIComponent(state)}`);
      setTowers(res.data);

      if (res.data.length > 0) {
        // Calculate center of mass for better view
        const newCenter = calculateCenter(res.data);
        setMapCenter(newCenter);
        // Maybe zoom out slightly if many towers?
        setZoom(state.length === 2 ? 6 : 7); // Heuristic: State abbr might be larger area? No, always large.
      } else {
        alert(`No towers found for state: ${state}`);
      }
    } catch (error) {
      // ...
      console.error("Failed to fetch towers by state:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
        const updatedTower = {
          ...tower,
          parcel: res.data.result._parcel
        };

        setSelectedTower(updatedTower);

        // Update the main towers list with the new data
        setTowers(prevTowers => prevTowers.map(t => t.id === tower.id ? updatedTower : t));
      }
    } catch (error) {
      console.error("Owner lookup failed:", error);
      alert("Could not fetch owner data.");
    } finally {
      setIsOwnerLoading(false);
    }
  };

  const handleBoundsChange = useCallback((bounds: any) => {
    setMapBounds(bounds);
  }, []);

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



  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          onSearch={handleSearch}
          onStateSelect={handleStateSelect}
          isLoading={isLoading}
          results={towers} // Shows list in sidebar too
          selectedTower={selectedTower}
          onLookupOwner={handleLookupOwner}
          isOwnerLoading={isOwnerLoading}
          ownerData={ownerData}
          onSelectTower={handleTowerSelect}
          currentView="map"
          onViewChange={(view) => {
            if (view === 'table') router.push('/towers');
          }}
        />

        <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* Search Area Button - Keep on Map */}
          {mounted && (
            <Box sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', gap: 2, alignItems: 'center' }}>
              <Paper elevation={3}>
                <button
                  onClick={searchTowersInArea}
                  disabled={isSearchLoading}
                  style={{
                    padding: '8px 16px',
                    cursor: isSearchLoading ? 'wait' : 'pointer',
                    backgroundColor: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    color: '#1976d2',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {isSearchLoading ? 'Searching...' : 'Search This Area'}
                </button>
              </Paper>
            </Box>
          )}

          {/* Map Section */}
          <Box sx={{ flex: 1, position: 'relative' }}>
            {mounted ? (
              <Map
                center={mapCenter}
                zoom={zoom}
                towers={towers}
                ghostTowers={ghostTowers}
                onTowerSelect={handleTowerSelect}
                selectedTower={selectedTower}
                onBoundsChange={handleBoundsChange}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                Loading Map...
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</Box>}>
      <HomeContent />
    </Suspense>
  );
}
