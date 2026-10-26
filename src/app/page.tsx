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
import MyLocationIcon from '@mui/icons-material/MyLocation';
import AddLocationIcon from '@mui/icons-material/AddLocation';
import { useGeolocation } from '@/hooks/useGeolocation';
// Dynamically import the map client-side only: MapLibre needs a DOM canvas
// and window, which the server render does not have.
const Map = dynamic(() => import('@/components/TowerMap'), {
  ssr: false,
  loading: () => <p>Loading Map...</p>
});
import AddOwnerDialog from '@/components/AddOwnerDialog';
import PromoteLeadDialog from '@/components/PromoteLeadDialog';
import MapDetailsPanel from '@/components/MapDetailsPanel';
import { DEFAULT_MAP_MODES, DEFAULT_MAP_STYLE, type MapModeState, type MapStyleId } from '@/components/ui/cluster-styles';
import { mapOverlaySx } from '@/lib/map-overlay';

interface Tower {
  id: number;
  type?: { name: string } | string;
  subType?: string;
  lat: number;
  lon: number;
  details?: any;
  parcel?: any;
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

/**
 * Map data is the whole filtered set, so a filter that was loaded before can be
 * restored from memory. Keyed by the API query, never by the viewport.
 */
const towerCache = new globalThis.Map<string, Tower[]>();

function HomeContent() {
  const router = useRouter();
  const [towers, setTowers] = useState<Tower[]>([]);
  const [towerLeads, setTowerLeads] = useState<any[]>([]); // Leads from local DB
  const [showLeads, setShowLeads] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.5, -64.0]); // Default to Moncton area
  const [zoom, setZoom] = useState<number>(7);
  const [boundsToFit, setBoundsToFit] = useState<[[number, number], [number, number]] | undefined>(undefined);
  const [shouldFitBounds, setShouldFitBounds] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLeadsLoading, setIsLeadsLoading] = useState<boolean>(false);
  const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedZip, setSelectedZip] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const { country: selectedCountry, setCountry } = useCountry();
  const [ownerData, setOwnerData] = useState<OwnerResult | null>(null);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [leadToPromote, setLeadToPromote] = useState<any>(null);
  const [addOwnerTower, setAddOwnerTower] = useState<any>(null);
  const [isTrackingLocation, setIsTrackingLocation] = useState<boolean>(false);
  const [mapStyle, setMapStyle] = useState<MapStyleId>(DEFAULT_MAP_STYLE);
  const [mapModes, setMapModes] = useState<MapModeState>(DEFAULT_MAP_MODES);
  const [isDroppingTower, setIsDroppingTower] = useState<boolean>(false);
  const { position: userPosition, error: geoError, start: startGeo, stop: stopGeo } = useGeolocation();

  const isMounted = useRef(true);
  const fetchSeq = useRef(0);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Additional filters state
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
      const towerId = parseInt(selectTowerParam);
      if (!isNaN(towerId)) {
        axios.get(`/api/towers/${towerId}`).then(res => {
          const t = res.data;
          if (t && t.lat && t.lon) {
            setMapCenter([t.lat, t.lon]);
            setZoom(16);
            setShouldFitBounds(false);
            setBoundsToFit(undefined);
            setSelectedTower(t);

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
        setBoundsToFit(undefined);
        setShowLeads(true); // Automatically show leads if we are pointing to one
      }
    }

    if (cityParam && cityParam !== selectedCity) {
      setSelectedCity(cityParam);
    }
  }, [searchParams, selectedCountry, setCountry]);

  // Fetch every tower matching the filters. The map clusters the full set
  // itself, so the points never depend on the viewport: panning and zooming
  // cannot move a cluster that was already on screen.
  useEffect(() => {
    const fetchTowers = async () => {
      if (!isMounted.current) return;
      const seq = ++fetchSeq.current;

      const params: Record<string, string> = { map: '1' };

      // Filters
      if (selectedCountry) params.country = selectedCountry;
      if (selectedProvince) params.state = selectedProvince;
      if (selectedCity) params.city = selectedCity;
      if (selectedZip) params.zip = selectedZip;

      if (selectedType) params.type = selectedType;
      if (selectedCarrier) params.carrier = selectedCarrier;
      if (searchQuery) params.search = searchQuery;

      // Reuse a filter set that was loaded before. Zooming and panning never
      // refetch, and going back to an earlier filter is instant.
      const cacheKey = JSON.stringify(params);
      const cached = towerCache.get(cacheKey);
      if (cached) {
        setTowers(cached);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data } = await axios.get('/api/towers', { params });
        // A slower, older request must never overwrite a newer filter result.
        if (isMounted.current && seq === fetchSeq.current) {
          towerCache.set(cacheKey, data);
          // Bound the cache: every entry is the full filtered set.
          if (towerCache.size > 8) towerCache.delete(towerCache.keys().next().value as string);
          setTowers(data);
        }
      } catch (error) {
        console.error('Error fetching towers:', error);
      } finally {
        if (isMounted.current && seq === fetchSeq.current) setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchTowers();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [selectedCountry, selectedProvince, selectedCity, selectedZip, selectedType, selectedCarrier, searchQuery]);

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
          if (selectedZip) params.set('zip', selectedZip);

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
  }, [shouldFitBounds, selectedCountry, selectedProvince, selectedCity, selectedZip, searchParams]);

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
        const params: any = { limit: 500, promoted: 'false' };
        if (selectedCountry) params.country = selectedCountry;
        if (selectedCity) params.city = selectedCity;
        if (searchQuery) params.search = searchQuery;

        const { data } = await axios.get('/api/tower-leads', { params });
        if (isMounted.current) setTowerLeads(data.data || []);
      } catch (error) {
        console.error('Error fetching tower leads:', error);
      } finally {
        if (isMounted.current) setIsLeadsLoading(false);
      }
    };

    fetchTowerLeads();
  }, [showLeads, selectedCity, selectedCountry, searchQuery]);

  // Closing the map popup clears the selection, so the sidebar and the map
  // agree. Without this the popup closes but the tower stays selected.
  const handleTowerDeselect = useCallback((id?: number) => {
    // A replaced popup closes after the new selection is in place. Compare the
    // id, or the old popup would clear the tower/lead just clicked.
    setSelectedTower(prev => (id == null || prev?.id === id ? null : prev));
  }, []);

  const handleTowerSelect = (tower: any) => {
    if (tower.action === 'promote') {
      handlePromoteClick(tower);
    } else if (tower.action === 'addOwner') {
      setAddOwnerTower(tower);
    } else {
      setSelectedTower(tower);
      // Map rows are light: fetch the full record so the parcel outline and the
      // address arrive. A late reply for an older selection is ignored.
      if (!tower.isLead && typeof tower.id === 'number' && !tower.parcel?.geometry) {
        axios.get(`/api/towers/${tower.id}`)
          .then(({ data }) => {
            if (!isMounted.current) return;
            setSelectedTower(prev => (prev && prev.id === tower.id ? { ...prev, ...data } : prev));
          })
          .catch(err => {
            // The light row still renders its popup; the detail is an extra.
            console.error('Failed to fetch tower details:', err);
          });
      }
      // Pan to the newly selected tower if it has coordinates
      if (tower.lat && tower.lon) {
        setMapCenter([tower.lat, tower.lon]);
        setShouldFitBounds(false); // Make sure bounds centering doesn't override it
        setBoundsToFit(undefined);
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
    setSelectedZip('');

    // Only fit to country if we DON'T have a specific lead/tower targeted in URL
    const hasCoordinates = searchParams.get('lat') && searchParams.get('lon');
    const hasSelectTower = searchParams.get('selectTower');
    if (!hasCoordinates && !hasSelectTower) {
      setShouldFitBounds(true);
    }

    setShowLeads(false);
    setTowerLeads([]);
  }, [selectedCountry, searchParams]);

  const handleProvinceChange = (newProvince: string) => {
    setSelectedProvince(newProvince);
    setSelectedCity('');
    setSelectedZip('');
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    // The selection belongs to the previous filter set.
    setSelectedTower(null);
  };

  const handleCityChange = (newCity: string) => {
    setSelectedCity(newCity);
    setSelectedZip('');
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    // The selection belongs to the previous filter set.
    setSelectedTower(null);
  };

  const handleZipChange = (newZip: string) => {
    setSelectedZip(newZip);
    setShouldFitBounds(true);
    setShowLeads(false);
    setTowerLeads([]);
    // The selection belongs to the previous filter set.
    setSelectedTower(null);
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
    if (filters.zip !== undefined && filters.zip !== selectedZip) handleZipChange(filters.zip);
    if (filters.type !== undefined) setSelectedType(filters.type);
    if (filters.carrier !== undefined) setSelectedCarrier(filters.carrier);
    if (filters.query !== undefined) setSearchQuery(filters.query);
  };


  const toggleLeadsVisibility = () => {
    setShowLeads(!showLeads);
  };

  const toggleLocationTracking = () => {
    if (isTrackingLocation) {
      stopGeo();
      setIsTrackingLocation(false);
    } else {
      startGeo();
      setIsTrackingLocation(true);
    }
  };

  // When we first acquire a GPS fix, recenter the map there once.
  const hasCenteredOnUserRef = useRef(false);
  useEffect(() => {
    if (isTrackingLocation && userPosition && !hasCenteredOnUserRef.current) {
      setMapCenter([userPosition.lat, userPosition.lon]);
      setZoom(17);
      setShouldFitBounds(false);
      setBoundsToFit(undefined);
      hasCenteredOnUserRef.current = true;
    }
    if (!isTrackingLocation) {
      hasCenteredOnUserRef.current = false;
    }
  }, [isTrackingLocation, userPosition]);

  const handleDropTower = async () => {
    if (!userPosition) return;
    if (!window.confirm('Drop a new tower at your current location?')) return;
    setIsDroppingTower(true);
    try {
      const { data: newTower } = await axios.post('/api/towers', {
        lat: userPosition.lat,
        lon: userPosition.lon,
        source: 'field'
      });
      if (!isMounted.current) return;
      // The new row must not be missing from a cached filter set.
      towerCache.clear();
      setTowers(prev => {
        const idx = prev.findIndex(t => t.id === newTower.id);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...prev[idx], ...newTower };
          return next;
        }
        return [...prev, newTower];
      });
      setSelectedTower(newTower);
    } catch (err) {
      console.error('Failed to drop tower', err);
      alert('Could not create tower. Please try again.');
    } finally {
      if (isMounted.current) setIsDroppingTower(false);
    }
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

        selectedZip={selectedZip}
        onZipSelect={handleZipChange}

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
            onTowerSelect={handleTowerSelect}
            onTowerDeselect={handleTowerDeselect}
            selectedTower={selectedTower}
            towerLeads={showLeads ? towerLeads : []}
            userPosition={isTrackingLocation ? userPosition : null}
            onLocate={toggleLocationTracking}
            mapStyle={mapStyle}
            mapModes={mapModes}
          />
        </Suspense>

        <Paper
          elevation={0}
          sx={{
            ...mapOverlaySx,
            position: 'absolute',
            top: 20,
            right: 20,
            zIndex: 1000,
            overflow: 'hidden',
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
              bgcolor: showLeads ? 'rgba(33, 150, 243, 0.10)' : 'transparent',
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

        <MapDetailsPanel
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
          mapModes={mapModes}
          onMapModesChange={setMapModes}
        />

        {/* Drop tower: only meaningful with a GPS fix, so it appears then. */}
        {isTrackingLocation && userPosition && (
          <Paper
            elevation={3}
            onClick={isDroppingTower ? undefined : handleDropTower}
            sx={{
              position: 'absolute',
              top: 90,
              right: 20,
              zIndex: 1000,
              p: 1.5,
              cursor: isDroppingTower ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              borderRadius: 2,
              bgcolor: 'success.soft',
              opacity: isDroppingTower ? 0.6 : 1,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <AddLocationIcon color="success" />
            <Box>
              <Box sx={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                {isDroppingTower ? 'Saving…' : 'Drop tower here'}
              </Box>
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {userPosition.lat.toFixed(5)}, {userPosition.lon.toFixed(5)}
              </Box>
            </Box>
          </Paper>
        )}


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
