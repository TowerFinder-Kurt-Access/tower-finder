'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import Box from '@mui/material/Box';
import dynamic from 'next/dynamic';
import Sidebar, { FilterState } from '@/components/Sidebar';
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

interface OwnerResult {
  result: {
    owner: string;
    address: string;
    parcel_id: string;
    geometry: any;
    [key: string]: any;
  } | null;
}

const COUNTRIES = ['Canada', 'USA'];

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  'Canada': [
    'Moncton', 'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Edmonton', 'Ottawa',
    'Winnipeg', 'Halifax', 'Quebec City', 'Saskatoon', 'Regina', "St. John's",
    'Victoria', 'Fredericton', 'Charlottetown'
  ],
  'USA': [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami'
  ]
};

// City coordinates for initial map positioning
const CITY_COORDINATES: { [key: string]: { center: [number, number], zoom: number } } = {
  // Canada
  'Moncton': { center: [46.0878, -64.7782], zoom: 12 },
  'Toronto': { center: [43.6532, -79.3832], zoom: 11 },
  'Vancouver': { center: [49.2827, -123.1207], zoom: 11 },
  'Montreal': { center: [45.5017, -73.5673], zoom: 11 },
  'Calgary': { center: [51.0447, -114.0719], zoom: 11 },
  'Edmonton': { center: [53.5461, -113.4938], zoom: 11 },
  'Ottawa': { center: [45.4215, -75.6972], zoom: 11 },
  'Winnipeg': { center: [49.8951, -97.1384], zoom: 11 },
  'Halifax': { center: [44.6488, -63.5752], zoom: 12 },
  'Quebec City': { center: [46.8139, -71.2080], zoom: 12 },
  'Saskatoon': { center: [52.1332, -106.6700], zoom: 12 },
  'Regina': { center: [50.4452, -104.6189], zoom: 12 },
  "St. John's": { center: [47.5615, -52.7126], zoom: 12 },
  'Victoria': { center: [48.4284, -123.3656], zoom: 12 },
  'Fredericton': { center: [45.9636, -66.6431], zoom: 13 },
  'Charlottetown': { center: [46.2382, -63.1311], zoom: 13 },

  // USA
  'New York': { center: [40.7128, -74.0060], zoom: 11 },
  'Los Angeles': { center: [34.0522, -118.2437], zoom: 11 },
  'Chicago': { center: [41.8781, -87.6298], zoom: 11 },
  'Houston': { center: [29.7604, -95.3698], zoom: 11 },
  'Miami': { center: [25.7617, -80.1918], zoom: 12 },
};

function HomeContent() {
  const router = useRouter();
  const [towers, setTowers] = useState<Tower[]>([]);
  const [towerLeads, setTowerLeads] = useState<any[]>([]); // Leads from local DB
  const [showLeads, setShowLeads] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.5, -64.0]); // Default to Moncton area
  const [zoom, setZoom] = useState<number>(7);
  const [mapBounds, setMapBounds] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLeadsLoading, setIsLeadsLoading] = useState<boolean>(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
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
    const countryParam = searchParams.get('country');

    if (latParam && lonParam) {
      const lat = parseFloat(latParam);
      const lon = parseFloat(lonParam);
      if (!isNaN(lat) && !isNaN(lon)) {
        setMapCenter([lat, lon]);
        setZoom(zoomParam ? parseInt(zoomParam) : 15); // Zoom in close if coordinates provided
      }
    }

    if (cityParam) {
      setSelectedCity(cityParam);
      // If country not set but implied? 
      // We might want to set country if possible, but city filter works on API.
    }

    if (countryParam) {
      setSelectedCountry(countryParam);
    }

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
        if (selectedCity) params.city = selectedCity;
        if (selectedType) params.type = selectedType;
        if (selectedCarrier) params.carrier = selectedCarrier;
        if (selectedLicensee) params.licensee = selectedLicensee;

        // BBox (only if allowed / needed)
        // If we want to support panning map to search area even with filters:
        if (mapBounds) {
          const { _southWest, _northEast } = mapBounds;
          params.bbox = `${_southWest.lng},${_southWest.lat},${_northEast.lng},${_northEast.lat}`;
        }

        // Note: api/towers does NOT support 'country' filter yet.
        // If selectedCountry is set but no City, we just rely on map bounds or explicit city.

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
  }, [mapBounds, selectedCity, selectedType, selectedCarrier, selectedLicensee]); // Country only affects city selection for now for Towers

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

  const handleTowerSelect = (tower: Tower) => {
    setSelectedTower(tower);
  };

  const handlePromoteClick = (lead: any) => {
    setLeadToPromote(lead);
  };

  const handlePromoteClose = () => {
    setLeadToPromote(null);
  };

  const handlePromoteSuccess = async (googleMapsUrl?: string) => {
    if (!leadToPromote) return;

    try {
      await axios.post(`/api/tower-leads/${leadToPromote.id}/promote`, {
        googleMapsUrl
      });

      // Remove from local state
      setTowerLeads(prev => prev.filter(l => l.id !== leadToPromote.id));
      setLeadToPromote(null);

    } catch (error) {
      console.error('Failed to promote lead:', error);
      alert('Failed to promote lead');
    }
  };

  const handleCountryChange = (newCountry: string) => {
    setSelectedCountry(newCountry);
    setSelectedCity(''); // Reset city when country changes
    setShowLeads(false);
    setTowerLeads([]);
  }

  const handleCityChange = (newCity: string) => {
    setSelectedCity(newCity);

    // Recenter map if city has coordinates
    if (CITY_COORDINATES[newCity]) {
      setMapCenter(CITY_COORDINATES[newCity].center);
      setZoom(CITY_COORDINATES[newCity].zoom);
    }

    // Reset leads when city changes
    setShowLeads(false);
    setTowerLeads([]);
  };

  const handleLookupOwner = async (tower: Tower) => {
    setIsOwnerLoading(true);
    try {
      // Implement owner lookup logic if needed (or verify where this is used)
      // Previous code had this prop but logic was missing or elsewhere.
      // Assuming it's calling an API.
      const res = await axios.get(`/api/towers/${tower.id}/owner`); // Hypothetical endpoint
      setOwnerData(res.data);
    } catch (e) {
      console.error(e);
      setOwnerData({ result: null });
    } finally {
      setIsOwnerLoading(false);
    }
  }

  const handleFilterChange = (filters: FilterState) => {
    if (filters.city !== undefined) setSelectedCity(filters.city);
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
        cities={selectedCountry ? CITIES_BY_COUNTRY[selectedCountry] || [] : []} // Only show cities for selected country
        selectedCity={selectedCity}
        onCitySelect={handleCityChange}
        countries={COUNTRIES}
        selectedCountry={selectedCountry}
        onCountrySelect={handleCountryChange}
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
            onBoundsChange={handleBoundsChange}
            onTowerSelect={handleTowerSelect}
            selectedTower={selectedTower}
            towerLeads={showLeads ? towerLeads : []}
            onLeadPromote={handlePromoteClick}
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
          onPromote={handlePromoteSuccess}
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
