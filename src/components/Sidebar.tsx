'use client';
import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import IconButton from '@mui/material/IconButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Tooltip from '@mui/material/Tooltip';
import ViewListIcon from '@mui/icons-material/ViewList';
import MapIcon from '@mui/icons-material/Map';
import ExploreIcon from '@mui/icons-material/Explore';
import TableRowsIcon from '@mui/icons-material/TableRows';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Link from 'next/link';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import { STATIC_LOCATIONS } from '@/lib/locations';
import { useCountry } from '@/lib/country-context';

interface Tower {
    id: number;
    type?: { name: string } | string;
    subType?: string;
    lat: number;
    lon: number;
    carrier?: { name: string };
    status?: string;
    googleMapsUrl?: string;
    isLead?: boolean;
    parcel?: {
        address?: string;
        cityRaw?: string;
        stateRaw?: string;
        provinceRaw?: string;
        city?: { name: string } | string;
        province?: { name: string } | string;
        owner?: {
            name?: string;
            [key: string]: any;
        };
        [key: string]: any;
    };
    details?: any;
}

export interface FilterState {
    query: string;
    city: string;
    zip: string;
    type: string;
    carrier: string;
}



interface SidebarProps {
    onSearch: (query: string) => void;

    // Selection handlers
    onCitySelect: (city: string) => void;
    selectedCity: string;

    onZipSelect?: (zip: string) => void;
    selectedZip?: string;

    onProvinceSelect: (province: string) => void;
    selectedProvince: string;

    onFilterChange: (filters: FilterState) => void;
    isLoading: boolean;
    results: Tower[];
    selectedTower: Tower | null;
    onLookupOwner: (tower: Tower) => void;
    isOwnerLoading: boolean;
    ownerData: any;
    onSelectTower?: (tower: Tower) => void;
    currentView: 'map' | 'table';
    onViewChange: (view: 'map' | 'table') => void;
}

export default function Sidebar({
    onSearch,
    onCitySelect,
    selectedCity,
    onZipSelect,
    selectedZip,
    onProvinceSelect,
    selectedProvince,
    onFilterChange,
    isLoading,
    results,
    selectedTower,
    onLookupOwner,
    isOwnerLoading,
    ownerData,
    onSelectTower,
    currentView,
    onViewChange
}: SidebarProps) {
    const [query, setQuery] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const [selectedType, setSelectedType] = useState('');
    const [selectedCarrier, setSelectedCarrier] = useState('');

    const { country: selectedCountry } = useCountry();

    const [types, setTypes] = useState<{ id: number, name: string }[]>([]);
    const [carriers, setCarriers] = useState<{ id: number, name: string }[]>([]);

    // Dynamic Filter Options
    const [availableCities, setAvailableCities] = useState<string[]>([]);
    const [availableZips, setAvailableZips] = useState<string[]>([]);

    // Fetch initial lookups
    useEffect(() => {
        // Fetch lookups
        fetch('/api/towers?distinct=lookups')
            .then(res => res.json())
            .then(data => {
                setTypes(data.types || []);
                setCarriers(data.carriers || []);
            })
            .catch(err => console.error('Failed to fetch lookups', err));
    }, []);

    const availableProvinces = selectedCountry
        ? (STATIC_LOCATIONS[selectedCountry] ? Object.keys(STATIC_LOCATIONS[selectedCountry]) : [])
        : [];

    // Fetch Cities and Zips when Country or Province changes
    useEffect(() => {
        if (selectedCountry) {
            let cityUrl = `/api/towers?distinct=cities&country=${encodeURIComponent(selectedCountry)}`;
            let zipUrl = `/api/towers?distinct=zips&country=${encodeURIComponent(selectedCountry)}`;
            if (selectedProvince) {
                const sp = `&state=${encodeURIComponent(selectedProvince)}`;
                cityUrl += sp;
                zipUrl += sp;
            }
            Promise.all([
                fetch(cityUrl).then(res => res.json()),
                fetch(zipUrl).then(res => res.json())
            ])
                .then(([citiesData, zipsData]) => {
                    setAvailableCities(citiesData);
                    setAvailableZips(zipsData);
                })
                .catch(err => console.error('Failed to fetch cities/zips', err));
        } else {
            setAvailableCities([]);
            setAvailableZips([]);
        }
    }, [selectedCountry, selectedProvince]);

    const triggerFilter = (newFilters: Partial<FilterState>) => {
        onFilterChange({
            query: newFilters.query !== undefined ? newFilters.query : query,
            city: newFilters.city !== undefined ? newFilters.city : selectedCity,
            zip: newFilters.zip !== undefined ? newFilters.zip : (selectedZip || ''),
            type: newFilters.type !== undefined ? newFilters.type : selectedType,
            carrier: newFilters.carrier !== undefined ? newFilters.carrier : selectedCarrier
        });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(query);
        triggerFilter({ query });
    };

    const toggleSidebar = () => {
        setCollapsed(!collapsed);
    };

    const handleProvinceChange = (event: React.SyntheticEvent, newValue: string | null) => {
        const val = newValue || '';
        if (onProvinceSelect) {
            onProvinceSelect(val);
        }
    };

    const handleCityChange = (event: React.SyntheticEvent, newValue: string | null) => {
        const val = newValue || '';
        if (onCitySelect) {
            onCitySelect(val);
        }
        triggerFilter({ city: val });
    };

    const handleZipChange = (event: React.SyntheticEvent, newValue: string | null) => {
        const val = newValue || '';
        if (onZipSelect) {
            onZipSelect(val);
        }
        triggerFilter({ zip: val });
    };

    const handleFilterSelect = (field: 'type' | 'carrier') => (event: React.SyntheticEvent, newValue: string | null) => {
        const val = newValue || '';
        if (field === 'type') setSelectedType(val);
        if (field === 'carrier') setSelectedCarrier(val);

        triggerFilter({ [field]: val });
    };

    if (collapsed) {
        return (
            <Box sx={{
                width: 50,
                height: '100%',
                bgcolor: 'background.paper',
                borderRight: '1px solid #ddd',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pt: 2,
                zIndex: 1000,
                transition: 'width 0.3s'
            }}>
                <IconButton onClick={toggleSidebar} size="small">
                    <ChevronRightIcon />
                </IconButton>
                <Tooltip title="Search">
                    <IconButton onClick={toggleSidebar} sx={{ mt: 2 }} size="small">
                        <SearchIcon />
                    </IconButton>
                </Tooltip>
            </Box>
        );
    }

    return (
        <Box sx={{
            width: 450,
            height: '100%',
            bgcolor: 'background.paper',
            borderRight: '1px solid #ddd',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            boxShadow: 3,
            transition: 'width 0.3s'
        }}>
            {/* Header / Toggle */}
            <Box sx={{
                p: 1,
                bgcolor: 'primary.main',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ ml: 1 }}>
                    Search & Details
                </Typography>
                <IconButton onClick={toggleSidebar} sx={{ color: 'white' }} size="small">
                    <ChevronLeftIcon />
                </IconButton>
            </Box>

            {/* Filter & Search Area */}
            <Box sx={{ p: 2, borderBottom: '1px solid #eee' }}>

                {/* City/Country/Province Filter - Only show on map view */}
                {currentView === 'map' && (
                    <>
                        <Autocomplete
                            fullWidth
                            size="small"
                            sx={{ mb: 2 }}
                            disabled={!selectedCountry}
                            options={availableProvinces}
                            value={selectedProvince || null}
                            onChange={handleProvinceChange}
                            renderInput={(params) => <TextField {...params} label="Province / State" />}
                        />

                        <Autocomplete
                            fullWidth
                            size="small"
                            sx={{ mb: 2 }}
                            disabled={!selectedCountry}
                            options={availableCities}
                            value={selectedCity || null}
                            onChange={handleCityChange}
                            renderInput={(params) => <TextField {...params} label="City" />}
                        />

                        <Autocomplete
                            fullWidth
                            size="small"
                            sx={{ mb: 2 }}
                            disabled={!selectedCountry}
                            options={availableZips}
                            value={selectedZip || null}
                            onChange={handleZipChange}
                            renderInput={(params) => <TextField {...params} label="Postal Code" />}
                        />

                        <Autocomplete
                            fullWidth
                            size="small"
                            sx={{ mb: 1 }}
                            options={types.map(t => t.name)}
                            value={selectedType || null}
                            onChange={handleFilterSelect('type')}
                            renderInput={(params) => <TextField {...params} label="Type" />}
                        />

                        <Autocomplete
                            fullWidth
                            size="small"
                            sx={{ mb: 1 }}
                            options={carriers.map(c => c.name)}
                            value={selectedCarrier || null}
                            onChange={handleFilterSelect('carrier')}
                            renderInput={(params) => <TextField {...params} label="Carrier" />}
                        />
                    </>
                )}

                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        placeholder="Search specific location..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        sx={{ bgcolor: 'white', borderRadius: 1 }}
                    />
                    <Button type="submit" variant="contained" color="secondary" disabled={isLoading} sx={{ minWidth: 'unset', p: 1 }}>
                        {isLoading ? <CircularProgress size={24} color="inherit" /> : <SearchIcon />}
                    </Button>
                </form>
                {results.length > 0 && selectedCity && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Showing filtered towers in {selectedCity}.
                    </Typography>
                )}
            </Box>

            {/* Scrollable Content (Details) */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>

                {/* Selected Details Section */}
                {selectedTower ? (
                    <Card variant="outlined" sx={{ borderColor: '#2196f3' }}>
                        <CardContent>
                            <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
                                <LocationOnIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: 'text-bottom' }} />
                                Selected Tower
                            </Typography>
                            <Typography variant="body2"><strong>ID:</strong> {selectedTower.id}</Typography>
                            <Typography variant="body2"><strong>Type:</strong> {typeof selectedTower.type === 'object' ? selectedTower.type?.name : selectedTower.type}</Typography>
                            <Typography variant="body2"><strong>Lat/Lon:</strong> {selectedTower.lat.toFixed(5)}, {selectedTower.lon.toFixed(5)}</Typography>
                            {selectedTower.parcel?.address && (
                                <Typography variant="body2" sx={{ mt: 1 }}><strong>Address:</strong> {selectedTower.parcel.address}</Typography>
                            )}

                            <Divider sx={{ my: 1.5 }} />

                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                Navigate to:
                            </Typography>
                            <Stack spacing={1}>
                                {!selectedTower.isLead && (
                                    <Button
                                        component={Link}
                                        href={`/towers?id=${selectedTower.id}`}
                                        variant="contained"
                                        size="small"
                                        fullWidth
                                        startIcon={<TableRowsIcon />}
                                        sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                                    >
                                        View in Towers
                                    </Button>
                                )}
                                {selectedTower.isLead && (
                                    <Button
                                        component={Link}
                                        href={`/tower-leads`}
                                        variant="outlined"
                                        size="small"
                                        fullWidth
                                        startIcon={<ExploreIcon />}
                                        sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                                    >
                                        View Tower Leads
                                    </Button>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                ) : (
                    <Box sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>
                        <LocationOnIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
                        <Typography variant="body2">
                            {currentView === 'map'
                                ? (selectedCity
                                    ? "Zooming to region... Select a tower."
                                    : "Please select a City to view towers.")
                                : "Select a tower from the table to view details."}
                        </Typography>
                    </Box>
                )}

            </Box>
        </Box>
    );
}
