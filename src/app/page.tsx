'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import Box from '@mui/material/Box';
import dynamic from 'next/dynamic';
import Sidebar, { FilterState } from '@/components/Sidebar';
import axios from 'axios';
import { Paper } from '@mui/material';
import { useCountry } from '@/lib/country-context';
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
  const [towerLeads, setTowerLeads] = useState<any[]>([]); // Leads from local DB
  const [showLeads, setShowLeads] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.5, -64.0]); // Default to Moncton area
  const [zoom, setZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<any>(null);
  const [boundsToFit, setBoundsToFit] = useState<[[number, number], [number, number]] | undefined>(undefined);
  const [shouldFitBounds, setShouldFitBounds] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLeadsLoading, setIsLeadsLoading] = useState<boolean>(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const { country: selectedCountry } = useCountry();
  const [ownerData, setOwnerData] = useState<OwnerResult | null>(null);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [leadToPromote, setLeadToPromote] = useState<any>(null);

  // Additional filters state
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');
  const [selectedLicensee, setSelectedLicensee] = useState<string>('');

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  const searchParams = useSearchParams();

  // Effect to handle URL params for selecting a tower or centering map
  useEffect(() => {
    const towerId = searchParams.get('towerId');
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');
    const zoomParam = searchParams.get('zoom');
    const cityParam = searchParams.get('city');
    if (latParam && lonParam) {
      const lat = parseFloat(latParam);
      const lon = parseFloat(lonParam);
      if (!isNaN(lat) && !isNaN(lon)) {
        setMapCenter([lat, lon]);
        setZoom(zoomParam ? parseInt(zoomParam) : 15); // Zoom in close if coordinates provided
      }
    }

    if (cityParam) setSelectedCity(cityParam);

    if (towerId && !selectedTower) {
      // Logic for URL-based tower selection could go here
    }
  }, [searchParams, selectedTower]);

  // Handle map bounds change
  const handleBoundsChange = useCallback((bounds: any) => {
    setMapBounds(bounds);
  }, []);

  // Fetch Towers based on filters and map bounds
  useEffect(() => {
    const fetchTowers = async () => {
      setIsLoading(true);
      try {
        const params: any = {};

        // Filters
        if (selectedCountry) params.country = selectedCountry;
        if (selectedProvince) params.state = selectedProvince;
        if (selectedCity) params.city = selectedCity;

        if (selectedType) params.type = selectedType;
        if (selectedCarrier) params.carrier = selectedCarrier;
        if (selectedLicensee) params.licensee = selectedLicensee;

        // BBox (only if allowed / needed)
        // Only use map bounds if we are NOT in the middle of a filter-triggered fit
        // And if we haven't just changed filters (which triggers a "global" search for that region)
        if (mapBounds && !shouldFitBounds && !((selectedCity || selectedProvince) && towers.length === 0)) {
          // Logic refinement: 
          // If I have a city selected, I generally WANT to see all towers in that city,
          // UNLESS I have zoomed in manually?
          // But if I have a city filter, `api/towers` might return ALL towers in city if limit allows.
          // If I send bbox, I restrict it.
          // If `shouldFitBounds` is true, it means we recently changed filter, so we want the initial "full view" of the filter results.
          // So we omit bbox.
          // If `shouldFitBounds` is false, it means we are panning around.
          const { _southWest, _northEast } = mapBounds;
          params.bbox = `${_southWest.lng},${_southWest.lat},${_northEast.lng},${_northEast.lat}`;
        }

        // Explicitly omit bbox if we are fitting bounds (refreshing data for new region)
        if (shouldFitBounds) {
          delete params.bbox;
        }

        const { data } = await axios.get('/api/towers', { params });
        setTowers(data);

      } catch (error) {
        console.error('Error fetching towers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchTowers();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [mapBounds, selectedCountry, selectedProvince, selectedCity, selectedType, selectedCarrier, selectedLicensee, shouldFitBounds]);

  // Fit bounds when towers change AND we have flagged to fit bounds
  // Fit bounds using Geocoding API when filter changes
  useEffect(() => {
    if (shouldFitBounds && (selectedCountry || selectedProvince || selectedCity)) {
      const fetchBounds = async () => {
        try {
          const params = new URLSearchParams();
          if (selectedCountry) params.set('country', selectedCountry);
          if (selectedProvince) params.set('province', selectedProvince);
          if (selectedCity) params.set('city', selectedCity);

          const res = await fetch(`/api/geocode?${params.toString()}`);
          if (res.ok) {
            const bounds = await res.json(); // { north, south, east, west }
            // Convert to Leaflet bounds: [[south, west], [north, east]]
            // Wait, Leaflet bounds are [[lat1, lon1], [lat2, lon2]] (corner 1, corner 2)
            setBoundsToFit([[bounds.south, bounds.west], [bounds.north, bounds.east]]);
          }
        } catch (error) {
          console.error('Geocoding failed, falling back to data bounds', error);
          // Fallback to data bounds handled below? 
          // If we fail here, we might want to let the "towers" effect handle it?
          // But we setShouldFitBounds(false) only on success?
          // If we don't set false, the other effect might run?
          // Actually, let's keep the other effect as a backup, but modified.
        } finally {
          setShouldFitBounds(false);
        }
      };
      fetchBounds();
    }
  }, [shouldFitBounds, selectedCountry, selectedProvince, selectedCity]);

  // Backup: Fit bounds when towers change if geocoding didn't happen (or if we want strict data fit?)
  // User prefers geocoding. So I'll disable this fallback for now or only use it if shouldFitBounds is STILL true (which implies geocoding failed/skipped).
  // But purely relying on Geocoding is safer for "empty" regions.
  /* 
  useEffect(() => {
    if (shouldFitBounds && towers.length > 0) {
      // ... existing logic ...
      setShouldFitBounds(false);
    }
  }, [towers, shouldFitBounds]); 
  */


  // Fetch Tower Leads
  useEffect(() => {
    // Only fetch leads if "Show Leads" is toggled ON
    if (!showLeads) {
      setTowerLeads([]);
      return;
    }

    const fetchTowerLeads = async () => {
      setIsLeadsLoading(true);
      try {
        const params: any = {
          limit: 500 // Reasonable limit for map display
        };

        // Filters
        if (selectedCountry) params.country = selectedCountry;
        if (selectedCity) params.city = selectedCity;

        const { data } = await axios.get('/api/tower-leads', { params });
        setTowerLeads(data.data || []);
      } catch (error) {
        console.error('Error fetching tower leads:', error);
      } finally {
        setIsLeadsLoading(false);
      }
    };

    fetchTowerLeads();
  }, [showLeads, selectedCity, selectedCountry]);

  const handleTowerSelect = (tower: any) => {
    if (tower.action === 'promote') {
      handlePromoteClick(tower);
    } else {
      setSelectedTower(tower);
    }
  };

  const handlePromoteClick = (lead: any) => {
    setLeadToPromote(lead);
  };

  const handlePromoteClose = () => {
    setLeadToPromote(null);
  };

  const handlePromoteSuccess = (leadId: number) => {
    // Remove from local state
    setTowerLeads(prev => prev.filter(l => l.id !== leadId));
    setLeadToPromote(null);
  };

  // Reset province/city when global country changes
  useEffect(() => {
    setSelectedProvince('');
    setSelectedCity('');
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    setTowers([]);
  }, [selectedCountry]);

  const handleProvinceChange = (newProvince: string) => {
    setSelectedProvince(newProvince);
    setSelectedCity('');
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    setTowers([]); // Clear current markers immediately
  };

  const handleCityChange = (newCity: string) => {
    setSelectedCity(newCity);
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    setTowers([]); // Clear current markers immediately
  };

  const handleLookupOwner = async (tower: Tower) => {
    setIsOwnerLoading(true);
    try {
      const res = await axios.get(`/api/towers/${tower.id}/owner`);
      setOwnerData(res.data);
    } catch (e) {
      console.error(e);
      setOwnerData({ result: null });
    } finally {
      setIsOwnerLoading(false);
    }
  }

  const handleFilterChange = (filters: FilterState) => {
    if (filters.city !== undefined && filters.city !== selectedCity) handleCityChange(filters.city);
    // ^ Note: Sidebar calls onCitySelect separately, but triggerFilter also includes city.
    // We should ensure we don't double trigger. 
    // Sidebar logic: handleCityChange triggers triggerFilter AND onCitySelect.
    // onFilterChange in Page updates state? 
    // Let's rely on specific handlers for Location, and general handler for others.

    if (filters.type !== undefined) setSelectedType(filters.type);
    if (filters.carrier !== undefined) setSelectedCarrier(filters.carrier);
    if (filters.licensee !== undefined) setSelectedLicensee(filters.licensee);
  }

  const toggleLeadsVisibility = () => {
    setShowLeads(!showLeads);
  };

  if (!mounted) return null;

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        results={towers}
        onSelectTower={handleTowerSelect}
        isOwnerLoading={isOwnerLoading}
        ownerData={ownerData}

        selectedCity={selectedCity}
        onCitySelect={handleCityChange}

        selectedProvince={selectedProvince}
        onProvinceSelect={handleProvinceChange}

        onFilterChange={handleFilterChange}
        onSearch={(q) => console.log(q)}
        isLoading={isLoading}
        selectedTower={selectedTower}
        onLookupOwner={handleLookupOwner}
        currentView='map'
        onViewChange={() => { }}
      />

      <Box sx={{ flexGrow: 1, position: 'relative' }}>
        <Suspense fallback={<div>Loading Map...</div>}>
          <Map
            towers={towers}
            center={mapCenter}
            zoom={zoom}
            bounds={boundsToFit}
            onBoundsChange={handleBoundsChange}
            onTowerSelect={handleTowerSelect}
            selectedTower={selectedTower}
            towerLeads={showLeads ? towerLeads : []}
          />
        </Suspense>

        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 1000,
            bgcolor: 'background.paper',
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <Box
            onClick={toggleLeadsVisibility}
            sx={{
              p: 1.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              '&:hover': { bgcolor: 'action.hover' },
              bgcolor: showLeads ? 'primary.soft' : 'background.paper'
            }}
          >
            <MapIcon color={showLeads ? "primary" : "action"} />
            <Box>
              <Box sx={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                {showLeads ? 'Hide Leads' : 'Show Leads'}
              </Box>
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {showLeads ? `${towerLeads.length} visible` : 'Click to show'}
              </Box>
            </Box>
          </Box>
        </Paper>

        <PromoteLeadDialog
          open={!!leadToPromote}
          onClose={handlePromoteClose}
          onSuccess={handlePromoteSuccess}
          lead={leadToPromote}
        />
      </Box>
    </Box>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
