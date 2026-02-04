'use client';
import { useState } from 'react';
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

interface Tower {
    id: number;
    type: string;
    subType?: string;
    lat: number;
    lon: number;
    licensee?: string;
    status?: string;
    googleMapsUrl?: string;
    parcel?: {
        address?: string;
        owner?: {
            name?: string;
            [key: string]: any;
        };
        [key: string]: any;
    };
    details?: any;
}

interface SidebarProps {
    onSearch: (query: string) => void;
    onStateSelect?: (state: string) => void; // Optional prop for backward compatibility
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

const CANADIAN_PROVINCES = [
    "British Columbia",
    "Alberta",
    "Saskatchewan",
    "Manitoba",
    "Ontario",
    "Quebec",
    "New Brunswick",
    "Nova Scotia",
    "Prince Edward Island",
    "Newfoundland and Labrador"
];

const PROVINCE_INITIATED_STATES = [
    "BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL"
];

export default function Sidebar({
    onSearch,
    onStateSelect,
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
    const [selectedProvince, setSelectedProvince] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(query);
    };

    const toggleSidebar = () => {
        setCollapsed(!collapsed);
    };

    const handleProvinceChange = (event: SelectChangeEvent) => {
        const val = event.target.value as string;
        setSelectedProvince(val);
        if (onStateSelect) {
            onStateSelect(val);
        }
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

                {/* Province Filter - Only show on map view */}
                {currentView === 'map' && (
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel id="province-select-label">Select Province / Region</InputLabel>
                        <Select
                            labelId="province-select-label"
                            id="province-select"
                            value={selectedProvince}
                            label="Select Province / Region"
                            onChange={handleProvinceChange}
                        >
                            <MenuItem value="">
                                <em>None</em>
                            </MenuItem>
                            {CANADIAN_PROVINCES.map((p) => (
                                <MenuItem key={p} value={p}>{p}</MenuItem>
                            ))}
                            <MenuItem disabled>---</MenuItem>
                            {PROVINCE_INITIATED_STATES.map((p) => (
                                <MenuItem key={p} value={p}>{p}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
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
                {results.length > 0 && selectedProvince && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Showing filtered towers in {selectedProvince}.
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
                            <Typography variant="body2"><strong>Type:</strong> {selectedTower.type}</Typography>
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
                                ? (selectedProvince
                                    ? "Zooming to region... Select a tower."
                                    : "Please select a Province to view towers.")
                                : "Select a tower from the table to view details."}
                        </Typography>
                    </Box>
                )}

            </Box>
        </Box>
    );
}
