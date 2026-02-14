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
import PromoteLeadDialog from '@/components/PromoteLeadDialog';

interface Tower {
  id: number;
  type?: { name: string } | string;
  subType?: string;
  lat: number;
  lon: number;
  details?: any;
  parcel?: any;
  licensee?: { name: string } | string;
  carrier?: { name: string };
  status?: string;
  source?: string;
}

interface FilterState {
  query: string;
  province: string;
  type: string;
  carrier: string;
  licensee: string;
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

// Province/State coordinates for initial map positioning (centered on populated areas)
const PROVINCE_COORDINATES: { [key: string]: { center: [number, number], zoom: number } } = {
  // Canadian Provinces - centered on major population centers
  "British Columbia": { center: [49.2827, -123.1207], zoom: 6 },      // Vancouver area
  "Alberta": { center: [51.0447, -114.0719], zoom: 6 },                // Calgary area
  "Saskatchewan": { center: [50.4452, -104.6189], zoom: 6 },           // Regina/Saskatoon area
  "Manitoba": { center: [49.8951, -97.1384], zoom: 6 },                // Winnipeg area
  "Ontario": { center: [43.6532, -79.3832], zoom: 6 },                 // Toronto/GTA area
  "Quebec": { center: [45.5017, -73.5673], zoom: 6 },                  // Montreal area
  "New Brunswick": { center: [45.9636, -66.6431], zoom: 7 },           // Fredericton area
  "Nova Scotia": { center: [44.6488, -63.5752], zoom: 7 },             // Halifax area
  "Prince Edward Island": { center: [46.2382, -63.1311], zoom: 9 },    // Charlottetown area
  "Newfoundland and Labrador": { center: [47.5615, -52.7126], zoom: 6 }, // St. John's area
  // Province Abbreviations
  "BC": { center: [49.2827, -123.1207], zoom: 6 },
  "AB": { center: [51.0447, -114.0719], zoom: 6 },
  "SK": { center: [50.4452, -104.6189], zoom: 6 },
  "MB": { center: [49.8951, -97.1384], zoom: 6 },
  "ON": { center: [43.6532, -79.3832], zoom: 6 },
  "QC": { center: [45.5017, -73.5673], zoom: 6 },
  "NB": { center: [45.9636, -66.6431], zoom: 7 },
  "NS": { center: [44.6488, -63.5752], zoom: 7 },
  "PE": { center: [46.2382, -63.1311], zoom: 9 },
  "NL": { center: [47.5615, -52.7126], zoom: 6 },
};

function HomeContent() {
  const router = useRouter();
  const [towers, setTowers] = useState<Tower[]>([]);
  const [towerLeads, setTowerLeads] = useState<any[]>([]); // Leads from local DB
  const [showLeads, setShowLeads] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.5, -64.0]);
  const [zoom, setZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLeadsLoading, setIsLeadsLoading] = useState<boolean>(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [ownerData, setOwnerData] = useState<OwnerResult | null>(null);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [leadToPromote, setLeadToPromote] = useState<any>(null);

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

  const handleFilterChange = async (filters: FilterState) => {
    setIsLoading(true);
    // Track selected province so Show Leads button knows when to enable
    if (filters.province !== undefined) {
      setSelectedProvince(filters.province);
      // Reset leads when province changes
      setShowLeads(false);
      setTowerLeads([]);
    }
    try {
      const params = new URLSearchParams();
      if (filters.province) params.append('state', filters.province);
      if (filters.type) params.append('type', filters.type);
      if (filters.carrier) params.append('carrier', filters.carrier);
      if (filters.licensee) params.append('licensee', filters.licensee);

      // Pan to province if selected and it's a province change (or just ensure view is correct)
      if (filters.province && PROVINCE_COORDINATES[filters.province]) {
        setMapCenter(PROVINCE_COORDINATES[filters.province].center);
        setZoom(PROVINCE_COORDINATES[filters.province].zoom);
      }

      if (!filters.province && !filters.type && !filters.carrier && !filters.licensee) {
        // If all filters are cleared, maybe clear towers or show all?
        // For now, if no province, we just clear to default?
        // Or let the API handle it (it might return too many).
        // The API defaults to limit 1000.
      }

      const res = await axios.get(`/api/towers?${params.toString()}`);
      setTowers(res.data);

      if (res.data.length > 0 && filters.province) {
        // Optional: refine center based on data
        // const newCenter = calculateCenter(res.data);
        // setMapCenter(newCenter);
        // setZoom(8);
      }
    } catch (error) {
      console.error("Filter fetch failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ...

  const handleStateSelect = async (state: string) => {
    setIsLoading(true);
    setSelectedProvince(state);
    // Hide leads when province changes - user will toggle them back on if wanted
    setShowLeads(false);
    setTowerLeads([]);
    try {
      if (!state) {
        setTowers([]);
        setIsLoading(false);
        return;
      }

      // Immediately pan to province if we have coordinates
      if (PROVINCE_COORDINATES[state]) {
        setMapCenter(PROVINCE_COORDINATES[state].center);
        setZoom(PROVINCE_COORDINATES[state].zoom);
      }

      const res = await axios.get(`/api/towers?state=${encodeURIComponent(state)}`);
      setTowers(res.data);

      if (res.data.length > 0) {
        const newCenter = calculateCenter(res.data);
        setMapCenter(newCenter);
        setZoom(8);
      } else {
        if (!PROVINCE_COORDINATES[state]) {
          alert(`No towers found for state: ${state}`);
        }
      }
    } catch (error) {
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

  // Toggle tower leads visibility for the current province
  const toggleLeadsVisibility = async () => {
    if (!selectedProvince) {
      alert('Please select a province first.');
      return;
    }

    if (showLeads) {
      // Hide leads
      setShowLeads(false);
      setTowerLeads([]);
      return;
    }

    // Show leads - fetch from local DB using the new API
    setIsLeadsLoading(true);
    try {
      const res = await axios.get(`/api/tower-leads?province=${encodeURIComponent(selectedProvince)}`);
      setTowerLeads(res.data); // The API now returns { data: [], totalCount: ... } or just []?
      // Wait, my rewrite returns { data: [], totalCount, ... }
      // OLD API returned array. NEW API returns object.
      // I need to check the API response format.
      // file:///c:/Users/alexa/Development/tower-finder/src/app/api/tower-leads/route.ts
      // It returns { data: leads, ... }

      const leadsData = res.data.data || [];
      setTowerLeads(leadsData);
      setShowLeads(true);

      if (leadsData.length === 0) {
        alert('No tower leads found for this province. Go to "Tower Leads" page to find more.');
      }
    } catch (error) {
      console.error('Failed to load tower leads:', error);
      alert('Failed to load tower leads.');
    } finally {
      setIsLeadsLoading(false);
    }
  };

  const handleTowerSelect = async (tower: any) => {
    if (tower.isLead) {
      if (tower.action === 'promote') {
        // Open the promote dialog
        setLeadToPromote(tower);
      } else {
        // Just select the lead for viewing
        const tempTower: Tower = {
          id: 0,
          type: tower.type || 'Unknown',
          lat: tower.lat,
          lon: tower.lon,
          status: 'Lead',
          source: `Tower Leads - ${tower.source}`
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
          onFilterChange={handleFilterChange}
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
                  onClick={toggleLeadsVisibility}
                  disabled={isLeadsLoading || !selectedProvince}
                  style={{
                    padding: '8px 16px',
                    cursor: (isLeadsLoading || !selectedProvince) ? 'not-allowed' : 'pointer',
                    backgroundColor: showLeads ? '#4CAF50' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    color: showLeads ? 'white' : '#1976d2',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {isLeadsLoading ? 'Loading Leads...' : (showLeads ? 'Hide Leads' : 'Show Leads')}
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
                towerLeads={showLeads ? towerLeads : []}
                onTowerSelect={handleTowerSelect}
                selectedTower={selectedTower}
                onBoundsChange={(bounds) => setMapBounds(bounds)}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                Loading Map...
              </Box>
            )}
          </Box>
        </Box>
      </Box>


      <PromoteLeadDialog
        open={!!leadToPromote}
        lead={leadToPromote}
        onClose={() => setLeadToPromote(null)}
        onSuccess={async (leadId) => {
          // Remove the promoted lead from the list
          setTowerLeads(prev => prev.filter(l => l.id !== leadId));
          // Refresh towers to show the new one
          if (selectedProvince) {
            try {
              const towersRes = await axios.get(`/api/towers?state=${encodeURIComponent(selectedProvince)}`);
              setTowers(towersRes.data);
            } catch (e) {
              console.error("Failed to refresh towers", e);
            }
          }
        }}
      />
    </Box >
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</Box>}>
      <HomeContent />
    </Suspense>
  );
}
