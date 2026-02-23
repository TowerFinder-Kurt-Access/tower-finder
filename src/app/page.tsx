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
import AddOwnerDialog from '@/components/AddOwnerDialog';
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
  const { country: selectedCountry, setCountry } = useCountry();
  const [ownerData, setOwnerData] = useState<OwnerResult | null>(null);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [leadToPromote, setLeadToPromote] = useState<any>(null);
  const [addOwnerTower, setAddOwnerTower] = useState<any>(null);
  const [isViewingSpecificTower, setIsViewingSpecificTower] = useState<boolean>(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

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
    const selectTowerParam = searchParams.get('selectTower');
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');
    const zoomParam = searchParams.get('zoom');
    const cityParam = searchParams.get('city');
    const countryParam = searchParams.get('country');

    // 0. Handle selectTower param — fetch tower and center map on it
    if (selectTowerParam) {
      setIsViewingSpecificTower(true);
      const towerId = parseInt(selectTowerParam);
      if (!isNaN(towerId)) {
        axios.get(`/api/towers/${towerId}`).then(res => {
          const t = res.data;
          if (t && t.lat && t.lon) {
            setMapCenter([t.lat, t.lon]);
            setZoom(16);
            setShouldFitBounds(false);
            setSelectedTower(t);
            // Pre-seed the map with this tower so it renders immediately
            setTowers([t]);

            // Update filters so sidebar reflects the tower's location
            if (t.parcel) {
              const prov = typeof t.parcel.province === 'object' ? t.parcel.province?.name : (t.parcel.provinceRaw || t.parcel.stateRaw);
              if (prov) {
                setSelectedProvince(prov);
              }
              const city = typeof t.parcel.city === 'object' ? t.parcel.city?.name : t.parcel.cityRaw;
              if (city) {
                setSelectedCity(city);
              }
            }
          }
        }).catch(err => {
          console.error('Failed to fetch tower for selectTower param:', err);
        });
      }
      return; // Don't process other params when selectTower is set
    } else {
      setIsViewingSpecificTower(false);
    }

    // 1. Sync Country Context from URL
    if (countryParam && countryParam !== selectedCountry) {
      setCountry(countryParam);
      // Updating country will trigger the reset effect below
    }

    // 2. Center map and show leads if coordinates provided
    if (latParam && lonParam) {
      const lat = parseFloat(latParam);
      const lon = parseFloat(lonParam);
      if (!isNaN(lat) && !isNaN(lon)) {
        setMapCenter([lat, lon]);
        if (zoomParam) setZoom(parseInt(zoomParam));

        // If we are showing a specific lead/tower, we don't want to fit bounds to the whole region
        setShouldFitBounds(false);
        setShowLeads(true); // Automatically show leads if we are pointing to one
      }
    }

    if (cityParam && cityParam !== selectedCity) {
      setSelectedCity(cityParam);
    }
  }, [searchParams, selectedCountry, setCountry]);

  // Handle map bounds change
  const handleBoundsChange = useCallback((bounds: any) => {
    if (isMounted.current) {
      setMapBounds(bounds);
      // Optional: track current zoom to prevent snapbacks if needed
      // but flyTo with stable state should be fine.
    }
  }, []);

  // Fetch Towers based on filters and map bounds
  // ... (lines 114-162 unchanged but I'll include the relevant parts)
  useEffect(() => {
    const fetchTowers = async () => {
      // Don't refetch all towers in the bounds if we explicitly targeted one tower from the URL redirect
      if (!isMounted.current || isViewingSpecificTower) return;
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
        if (mapBounds && !shouldFitBounds && !((selectedCity || selectedProvince) && towers.length === 0)) {
          const { north, south, east, west } = mapBounds;
          params.bbox = `${west},${south},${east},${north}`;
        }

        if (shouldFitBounds) {
          delete params.bbox;
        }

        const { data } = await axios.get('/api/towers', { params });
        if (isMounted.current) setTowers(data);
      } catch (error) {
        console.error('Error fetching towers:', error);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchTowers();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [mapBounds, selectedCountry, selectedProvince, selectedCity, selectedType, selectedCarrier, selectedLicensee, shouldFitBounds, towers.length, isViewingSpecificTower]);

  // Fit bounds using Geocoding API when filter changes
  useEffect(() => {
    if (shouldFitBounds && (selectedCountry || selectedProvince || selectedCity)) {
      // If URL has lat/lon, don't auto-fit bounds (let the explicit coordinates win)
      if (searchParams.get('lat') && searchParams.get('lon')) {
        setShouldFitBounds(false);
        return;
      }

      const fetchBounds = async () => {
        try {
          const params = new URLSearchParams();
          if (selectedCountry) params.set('country', selectedCountry);
          if (selectedProvince) params.set('province', selectedProvince);
          if (selectedCity) params.set('city', selectedCity);

          const res = await fetch(`/api/geocode?${params.toString()}`);
          if (res.ok) {
            const bounds = await res.json();
            if (isMounted.current) setBoundsToFit([[bounds.south, bounds.west], [bounds.north, bounds.east]]);
          }
        } catch (error) {
          console.error('Geocoding failed', error);
        } finally {
          if (isMounted.current) setShouldFitBounds(false);
        }
      };
      fetchBounds();
    }
  }, [shouldFitBounds, selectedCountry, selectedProvince, selectedCity, searchParams]);

  // Fetch Tower Leads
  useEffect(() => {
    if (!showLeads) {
      setTowerLeads([]);
      return;
    }

    const fetchTowerLeads = async () => {
      if (!isMounted.current) return;
      setIsLeadsLoading(true);
      try {
        const params: any = { limit: 500 };
        if (selectedCountry) params.country = selectedCountry;
        if (selectedCity) params.city = selectedCity;

        const { data } = await axios.get('/api/tower-leads', { params });
        if (isMounted.current) setTowerLeads(data.data || []);
      } catch (error) {
        console.error('Error fetching tower leads:', error);
      } finally {
        if (isMounted.current) setIsLeadsLoading(false);
      }
    };

    fetchTowerLeads();
  }, [showLeads, selectedCity, selectedCountry]);

  const handleTowerSelect = (tower: any) => {
    if (tower.action === 'promote') {
      handlePromoteClick(tower);
    } else if (tower.action === 'addOwner') {
      setAddOwnerTower(tower);
    } else {
      setSelectedTower(tower);
      setIsViewingSpecificTower(false); // They clicked a new tower or clicked space, so unlock fetching
      // Pan to the newly selected tower if it has coordinates
      if (tower.lat && tower.lon) {
        setMapCenter([tower.lat, tower.lon]);
        setShouldFitBounds(false); // Make sure bounds centering doesn't override it
      }
    }
  };

  const handlePromoteClick = (lead: any) => {
    setLeadToPromote(lead);
  };

  const handlePromoteClose = () => {
    setLeadToPromote(null);
  };

  const handlePromoteSuccess = (leadId: number) => {
    setTowerLeads(prev => prev.filter(l => l.id !== leadId));
    setLeadToPromote(null);
  };

  // Reset province/city when global country changes
  useEffect(() => {
    setSelectedProvince('');
    setSelectedCity('');

    // Only fit to country if we DON'T have a specific lead/tower targeted in URL
    const hasCoordinates = searchParams.get('lat') && searchParams.get('lon');
    const hasSelectTower = searchParams.get('selectTower');
    if (!hasCoordinates && !hasSelectTower) {
      setShouldFitBounds(true);
    }

    setShowLeads(false);
    setTowerLeads([]);
    setTowers([]);
  }, [selectedCountry, searchParams]);

  const handleProvinceChange = (newProvince: string) => {
    setSelectedProvince(newProvince);
    setSelectedCity('');
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    setTowers([]);
  };

  const handleCityChange = (newCity: string) => {
    setSelectedCity(newCity);
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    setTowers([]);
  };

  const handleLookupOwner = async (tower: Tower) => {
    setIsOwnerLoading(true);
    try {
      const res = await axios.get(`/api/towers/${tower.id}/owner`);
      if (isMounted.current) setOwnerData(res.data);
    } catch (e) {
      console.error(e);
      if (isMounted.current) setOwnerData({ result: null });
    } finally {
      if (isMounted.current) setIsOwnerLoading(false);
    }
  };

  const handleFilterChange = (filters: FilterState) => {
    if (filters.city !== undefined && filters.city !== selectedCity) handleCityChange(filters.city);
    if (filters.type !== undefined) setSelectedType(filters.type);
    if (filters.carrier !== undefined) setSelectedCarrier(filters.carrier);
    if (filters.licensee !== undefined) setSelectedLicensee(filters.licensee);
  };


  const toggleLeadsVisibility = () => {
    setShowLeads(!showLeads);
  };

  if (!mounted) return null;

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
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

        <AddOwnerDialog
          open={!!addOwnerTower}
          onClose={() => setAddOwnerTower(null)}
          onSuccess={() => {
            setAddOwnerTower(null);
          }}
          towerId={addOwnerTower?.id}
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
