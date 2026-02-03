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
        [key: string]: any;
    };
    details?: any;
}

interface SidebarProps {
    onSearch: (query: string) => void;
    isLoading: boolean;
    results: Tower[];
    selectedTower: Tower | null;
    onLookupOwner: (tower: Tower) => void;
    isOwnerLoading: boolean;
    ownerData: any;
}

export default function Sidebar({
    onSearch,
    isLoading,
    results,
    selectedTower,
    onLookupOwner,
    isOwnerLoading,
    ownerData
}: SidebarProps) {
    const [query, setQuery] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(query);
    };

    return (
        <Box sx={{
            width: 400,
            height: '100vh',
            bgcolor: 'background.paper',
            borderRight: '1px solid #ddd',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            boxShadow: 3
        }}>
            {/* Header / Search Area */}
            <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
                <Typography variant="h5" fontWeight="bold" gutterBottom>
                    Tower CRM
                </Typography>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        placeholder="Search location..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        sx={{ bgcolor: 'white', borderRadius: 1 }}
                    />
                    <Button type="submit" variant="contained" color="secondary" disabled={isLoading}>
                        {isLoading ? <CircularProgress size={24} /> : <SearchIcon />}
                    </Button>
                </form>
            </Box>

            {/* Results Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>

                {selectedTower ? (
                    <Box>
                        <Card sx={{ mb: 2, border: '1px solid #2196f3' }}>
                            <CardContent>
                                <Typography variant="subtitle1" color="primary" fontWeight="bold">
                                    <LocationOnIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
                                    Selected Tower
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    ID: {selectedTower.id}
                                </Typography>
                                <Typography variant="body1">
                                    <strong>Type:</strong> {selectedTower.type || 'Unknown'}
                                </Typography>
                                {selectedTower.licensee && (
                                    <Typography variant="body1">
                                        <strong>Licensee:</strong> {selectedTower.licensee}
                                    </Typography>
                                )}
                                {selectedTower.parcel?.address && (
                                    <Typography variant="body1">
                                        <strong>Address:</strong> {selectedTower.parcel.address}
                                    </Typography>
                                )}
                                <Typography variant="body2" color="text.secondary">
                                    <strong>Coordinates:</strong> {selectedTower.lat.toFixed(6)}, {selectedTower.lon.toFixed(6)}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Status:</strong> {selectedTower.status || 'Unknown'}
                                </Typography>

                                <Box sx={{ mt: 2 }}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        startIcon={<BusinessIcon />}
                                        onClick={() => onLookupOwner(selectedTower)}
                                        disabled={isOwnerLoading}
                                    >
                                        {isOwnerLoading ? 'Looking up...' : 'Get Land Owner'}
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>

                        {ownerData && (
                            <Card sx={{ mb: 2, bgcolor: '#f0f7ff' }}>
                                <CardContent>
                                    <Typography variant="subtitle2" color="success.main" fontWeight="bold" gutterBottom>
                                        Owner Information
                                    </Typography>
                                    {ownerData.result ? (
                                        <>
                                            <Typography variant="body2"><strong>Owner:</strong> {ownerData.result.owner || 'N/A'}</Typography>
                                            <Typography variant="body2"><strong>Address:</strong> {ownerData.result.address || 'N/A'}</Typography>
                                            <Typography variant="body2"><strong>Parcel ID:</strong> {ownerData.result.parcel_id || 'N/A'}</Typography>
                                        </>
                                    ) : (
                                        <Typography variant="body2" color="error">No owner data found.</Typography>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </Box>
                ) : (
                    <Typography variant="caption" color="text.secondary" align="center" display="block">
                        {results.length > 0
                            ? `${results.length} towers found. Click a marker to view details.`
                            : 'Search for a location to find towers.'}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}
