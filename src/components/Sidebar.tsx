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
import ViewListIcon from '@mui/icons-material/ViewList'; // For Towers view
import MapIcon from '@mui/icons-material/Map';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { STATIC_LOCATIONS } from '@/lib/locations';
import { useCountry } from '@/lib/country-context';

interface Tower {
    id: number;
    type?: { name: string } | string;
    subType?: string;
    lat: number;
    lon: number;
    licensee?: { name: string } | string;
    carrier?: { name: string };
    status?: string;
    googleMapsUrl?: string;
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
    type: string;
    carrier: string;
    licensee: string;
}



interface SidebarProps {
    onSearch: (query: string) => void;

    // Selection handlers
    onCitySelect: (city: string) => void;
    selectedCity: string;

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
    const [selectedLicensee, setSelectedLicensee] = useState('');

    const { country: selectedCountry } = useCountry();

    const [types, setTypes] = useState<{ id: number, name: string }[]>([]);
    const [carriers, setCarriers] = useState<{ id: number, name: string }[]>([]);
    const [licensees, setLicensees] = useState<{ id: number, name: string }[]>([]);

    // Dynamic Filter Options
    const [availableCities, setAvailableCities] = useState<string[]>([]);

    // Fetch initial lookups
    useEffect(() => {
        // Fetch lookups
        fetch('/api/towers?distinct=lookups')
            .then(res => res.json())
            .then(data => {
                setTypes(data.types || []);
                setCarriers(data.carriers || []);
                setLicensees(data.licensees || []);
            })
            .catch(err => console.error('Failed to fetch lookups', err));
    }, []);

    const availableProvinces = selectedCountry
        ? (STATIC_LOCATIONS[selectedCountry] ? Object.keys(STATIC_LOCATIONS[selectedCountry]) : [])
        : [];

    // Fetch Cities when Country or Province changes
    useEffect(() => {
        if (selectedCountry) {
            let url = `/api/towers?distinct=cities&country=${encodeURIComponent(selectedCountry)}`;
            if (selectedProvince) {
                url += `&state=${encodeURIComponent(selectedProvince)}`;
            }
            fetch(url)
                .then(res => res.json())
                .then(data => setAvailableCities(data))
                .catch(err => console.error('Failed to fetch cities', err));
        } else {
            setAvailableCities([]);
        }
    }, [selectedCountry, selectedProvince]);

    const triggerFilter = (newFilters: Partial<FilterState>) => {
        onFilterChange({
            query: newFilters.query !== undefined ? newFilters.query : query,
            city: newFilters.city !== undefined ? newFilters.city : selectedCity,
            type: newFilters.type !== undefined ? newFilters.type : selectedType,
            carrier: newFilters.carrier !== undefined ? newFilters.carrier : selectedCarrier,
            licensee: newFilters.licensee !== undefined ? newFilters.licensee : selectedLicensee
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

    const handleProvinceChange = (event: SelectChangeEvent) => {
        const val = event.target.value as string;
        if (onProvinceSelect) {
            onProvinceSelect(val);
        }
    };

    const handleCityChange = (event: SelectChangeEvent) => {
        const val = event.target.value as string;
        if (onCitySelect) {
            onCitySelect(val);
        }
        triggerFilter({ city: val });
    };

    const handleFilterSelect = (field: 'type' | 'carrier' | 'licensee') => (event: SelectChangeEvent) => {
        const val = event.target.value as string;
        if (field === 'type') setSelectedType(val);
        if (field === 'carrier') setSelectedCarrier(val);
        if (field === 'licensee') setSelectedLicensee(val);

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
            width: 350,
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
                        <FormControl fullWidth size="small" sx={{ mb: 2 }} disabled={!selectedCountry}>
                            <InputLabel id="province-select-label">Province / State</InputLabel>
                            <Select
                                labelId="province-select-label"
                                value={selectedProvince}
                                label="Province / State"
                                onChange={handleProvinceChange}
                            >
                                <MenuItem value=""><em>All Regions</em></MenuItem>
                                {availableProvinces.map((p) => (
                                    <MenuItem key={p} value={p}>{p}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small" sx={{ mb: 2 }} disabled={!selectedCountry}>
                            <InputLabel id="city-select-label">City</InputLabel>
                            <Select
                                labelId="city-select-label"
                                value={selectedCity}
                                label="City"
                                onChange={handleCityChange}
                            >
                                <MenuItem value=""><em>All Cities</em></MenuItem>
                                {availableCities.map((city) => (
                                    <MenuItem key={city} value={city}>{city}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                            <InputLabel>Type</InputLabel>
                            <Select value={selectedType} label="Type" onChange={handleFilterSelect('type')}>
                                <MenuItem value=""><em>All</em></MenuItem>
                                {types.map(t => <MenuItem key={t.id} value={t.name}>{t.name}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                            <InputLabel>Carrier</InputLabel>
                            <Select value={selectedCarrier} label="Carrier" onChange={handleFilterSelect('carrier')}>
                                <MenuItem value=""><em>All</em></MenuItem>
                                {carriers.map(c => <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                            <InputLabel>Licensee</InputLabel>
                            <Select value={selectedLicensee} label="Licensee" onChange={handleFilterSelect('licensee')}>
                                <MenuItem value=""><em>All</em></MenuItem>
                                {licensees.map(l => <MenuItem key={l.id} value={l.name}>{l.name}</MenuItem>)}
                            </Select>
                        </FormControl>
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

                            <Button
                                fullWidth
                                variant="contained"
                                size="small"
                                startIcon={<BusinessIcon />}
                                onClick={() => onLookupOwner(selectedTower)}
                                disabled={isOwnerLoading}
                                sx={{ mt: 2 }}
                            >
                                {isOwnerLoading ? 'Loading...' : 'Get Owner'}
                            </Button>

                            {ownerData && (
                                <Box sx={{ mt: 2, p: 1, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                                    <Typography variant="caption" fontWeight="bold">Owner Data:</Typography>
                                    <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                        {ownerData.result?.owner || 'No owner found'}
                                    </Typography>
                                </Box>
                            )}
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
