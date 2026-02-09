'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import {
    Box,
    Paper,
    Typography,
    IconButton,
    Button,
    Divider,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    CircularProgress,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Chip,
    Toolbar,
    AppBar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MapIcon from '@mui/icons-material/Map';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StreetviewIcon from '@mui/icons-material/Streetview';
import BusinessIcon from '@mui/icons-material/Business';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PersonIcon from '@mui/icons-material/Person';
import NotesPanel from '@/components/NotesPanel';
import { TOWER_STATUS_OPTIONS, getStatusLabel } from '@/lib/constants';

// Dynamically import Map to avoid SSR issues with Leaflet
const Map = dynamic(() => import('@/components/Map'), {
    ssr: false,
    loading: () => <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box>
});

interface Note {
    id: number;
    content: string;
    author: string;
    createdAt: string;
    updatedAt: string;
}

interface Tower {
    id: number;
    lat: number;
    lon: number;
    type?: string;
    status?: string;
    licensee?: string;
    source?: string;
    streetViewUrl?: string;
    parcel?: {
        address?: string;
        city?: string;
        county?: string;
        state?: string;
        zip?: string;
        parcelId?: string;
        dataSource?: string;
        owner?: {
            name?: string;
            address?: string;
            type?: string;
        };
    };
    notes?: Note[];
}

interface PageProps {
    params: Promise<{ id: string }>;
}

const AUTHOR_STORAGE_KEY = 'tower-finder-note-author';

export default function TowerDetailPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const towerId = parseInt(resolvedParams.id);
    const router = useRouter();

    const [tower, setTower] = useState<Tower | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [notes, setNotes] = useState<Note[]>([]);
    const [isOwnerLoading, setIsOwnerLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [streetViewUrl, setStreetViewUrl] = useState('');
    const [isEditingStreetView, setIsEditingStreetView] = useState(false);
    const [isSavingStreetView, setIsSavingStreetView] = useState(false);

    // Status change note dialog
    const [statusNoteDialogOpen, setStatusNoteDialogOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [statusNoteAuthor, setStatusNoteAuthor] = useState('');

    useEffect(() => {
        setMounted(true);
        loadTower();
    }, [towerId]);

    // Load saved author
    useEffect(() => {
        const savedAuthor = localStorage.getItem(AUTHOR_STORAGE_KEY);
        if (savedAuthor) {
            setStatusNoteAuthor(savedAuthor);
        }
    }, []);

    const loadTower = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/towers/${towerId}`);
            setTower(res.data);
            setStatus(res.data.status || '');
            setNotes(res.data.notes || []);
            setStreetViewUrl(res.data.streetViewUrl || '');
        } catch (error) {
            console.error('Failed to load tower:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewOnMap = () => {
        if (tower) {
            router.push(`/?selectTower=${tower.id}`);
        }
    };

    const handleOpenGoogleMaps = () => {
        if (tower) {
            window.open(`https://www.google.com/maps?q=${tower.lat},${tower.lon}`, '_blank');
        }
    };

    const handleOpenSatelliteView = () => {
        if (tower) {
            // Open Google Maps in satellite view at high zoom centered on exact coordinates
            window.open(`https://www.google.com/maps/@${tower.lat},${tower.lon},20z/data=!3m1!1e3`, '_blank');
        }
    };

    const handleOpenBingMaps = () => {
        if (tower) {
            window.open(`https://www.bing.com/maps?cp=${tower.lat}~${tower.lon}&lvl=17&style=r`, '_blank');
        }
    };

    const handleLookupOwner = async () => {
        if (!tower) return;
        setIsOwnerLoading(true);
        try {
            const res = await axios.get(`/api/owner?lat=${tower.lat}&lon=${tower.lon}`);

            if (res.data.result?._parcel) {
                const parcelData = res.data.result._parcel;

                // Extract owner name
                let ownerName = '';
                if (parcelData.owner?.name) {
                    ownerName = parcelData.owner.name;
                } else if (res.data.result.owner && res.data.result.owner !== 'Unknown' && res.data.result.owner !== 'UNKNOWN') {
                    ownerName = res.data.result.owner;
                }

                // Don't use parcel ID as owner name
                if (ownerName && ownerName === parcelData.parcelId) {
                    console.warn('Owner name matches parcel ID, clearing owner name');
                    ownerName = '';
                }

                // Update tower data
                const updatedTower = {
                    ...tower,
                    parcel: parcelData
                };

                setTower(updatedTower);

                if (ownerName) {
                    alert(`Owner found: ${ownerName}`);
                } else {
                    alert('Parcel found, but owner information is not available');
                }
            } else {
                alert("No parcel data found for this location.");
            }
        } catch (error) {
            console.error("Owner lookup failed:", error);
            alert("Could not fetch owner data.");
        } finally {
            setIsOwnerLoading(false);
        }
    };

    const handleStatusChange = (event: SelectChangeEvent) => {
        const newStatus = event.target.value;
        setPendingStatus(newStatus);
        setStatusNote('');
        setStatusNoteDialogOpen(true);
    };

    const handleStatusSave = async (addNote: boolean) => {
        if (!tower) return;

        setSaving(true);
        try {
            // Update status
            await axios.patch(`/api/towers/${tower.id}`, {
                status: pendingStatus
            });

            // Optionally add a note about the status change
            if (addNote && statusNote.trim() && statusNoteAuthor.trim()) {
                localStorage.setItem(AUTHOR_STORAGE_KEY, statusNoteAuthor.trim());
                const noteContent = `[Status changed to "${getStatusLabel(pendingStatus)}"]\n${statusNote.trim()}`;
                await axios.post(`/api/towers/${tower.id}/notes`, {
                    content: noteContent,
                    author: statusNoteAuthor.trim()
                });
            }

            setStatus(pendingStatus);
            setStatusNoteDialogOpen(false);
            loadTower();
        } catch (error) {
            console.error('Error updating status:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleNotesChange = () => {
        loadTower();
    };

    const handleSaveStreetViewUrl = async () => {
        if (!tower) return;
        setIsSavingStreetView(true);
        try {
            await axios.patch(`/api/towers/${tower.id}`, {
                streetViewUrl: streetViewUrl.trim() || null
            });
            setIsEditingStreetView(false);
            loadTower();
        } catch (error) {
            console.error('Error saving street view URL:', error);
            alert('Failed to save Street View URL');
        } finally {
            setIsSavingStreetView(false);
        }
    };

    const handleOpenSavedStreetView = () => {
        if (streetViewUrl) {
            window.open(streetViewUrl, '_blank');
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!tower) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h6">Tower not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/towers')} sx={{ mt: 2 }}>
                    Back to Towers
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Action Bar */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar sx={{ gap: 1 }}>
                    <IconButton edge="start" onClick={() => router.push('/towers')}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Tower #{tower.id}
                    </Typography>
                    <Button
                        startIcon={<MapIcon />}
                        onClick={handleViewOnMap}
                        size="small"
                    >
                        View on Map
                    </Button>
                    <Button
                        startIcon={<OpenInNewIcon />}
                        onClick={handleOpenGoogleMaps}
                        size="small"
                    >
                        Google Maps
                    </Button>
                    <Button
                        startIcon={<StreetviewIcon />}
                        onClick={handleOpenSatelliteView}
                        size="small"
                    >
                        Satellite View
                    </Button>
                    {streetViewUrl && (
                        <Button
                            startIcon={<StreetviewIcon />}
                            onClick={handleOpenSavedStreetView}
                            size="small"
                            variant="contained"
                            color="success"
                        >
                            Saved Street View
                        </Button>
                    )}
                    <Button
                        startIcon={<BusinessIcon />}
                        onClick={handleLookupOwner}
                        disabled={isOwnerLoading}
                        size="small"
                    >
                        {isOwnerLoading ? 'Loading...' : 'Lookup Owner'}
                    </Button>
                    <Button
                        startIcon={<TravelExploreIcon />}
                        onClick={handleOpenBingMaps}
                        size="small"
                    >
                        Search Nearby
                    </Button>
                </Toolbar>
            </AppBar>

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#f5f5f5' }}>
                <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
                    {/* Quick Info Card - Most Important for Callers */}
                    <Paper sx={{ p: 3, mb: 3, bgcolor: '#f8f9fa', border: '2px solid #e0e0e0' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h5" sx={{ fontWeight: 600 }}>
                                Tower Information
                            </Typography>
                            <Box>
                                {status && (
                                    <Chip
                                        label={getStatusLabel(status)}
                                        size="medium"
                                        color="primary"
                                        sx={{ fontSize: '1rem', fontWeight: 600 }}
                                    />
                                )}
                            </Box>
                        </Box>
                        <Divider sx={{ mb: 2 }} />

                        {/* Address - Most Important */}
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Address
                            </Typography>
                            <Typography variant="h6" sx={{ mt: 0.5 }}>
                                {tower.parcel?.address || 'Address not available'}
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                {[tower.parcel?.city, tower.parcel?.state, tower.parcel?.zip].filter(Boolean).join(', ') || 'Location details not available'}
                            </Typography>
                        </Box>

                        {/* Key Details Grid */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Type</Typography>
                                <Typography variant="body1" sx={{ fontSize: '1.1rem' }}>{tower.type || 'Unknown'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Licensee</Typography>
                                <Typography variant="body1" sx={{ fontSize: '1.1rem' }}>{tower.licensee || 'N/A'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Coordinates</Typography>
                                <Typography variant="body1" sx={{ fontSize: '1.1rem' }}>{tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>County</Typography>
                                <Typography variant="body1" sx={{ fontSize: '1.1rem' }}>{tower.parcel?.county || 'N/A'}</Typography>
                            </Box>
                        </Box>

                        {/* Status Change */}
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                            Update Status
                        </Typography>
                        <FormControl fullWidth size="small">
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={status}
                                label="Status"
                                onChange={handleStatusChange}
                                disabled={saving}
                            >
                                {TOWER_STATUS_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                                {/* Show current status if it's a legacy value not in options */}
                                {status && !TOWER_STATUS_OPTIONS.find(o => o.value === status) && (
                                    <MenuItem value={status}>
                                        {getStatusLabel(status)} (Legacy)
                                    </MenuItem>
                                )}
                            </Select>
                        </FormControl>

                        {/* Street View URL */}
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                            Custom Street View URL
                        </Typography>
                        {isEditingStreetView ? (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={streetViewUrl}
                                    onChange={(e) => setStreetViewUrl(e.target.value)}
                                    placeholder="Paste Google Street View URL here"
                                    helperText="Find the correct Street View location and paste the URL here"
                                />
                                <Button
                                    variant="contained"
                                    onClick={handleSaveStreetViewUrl}
                                    disabled={isSavingStreetView}
                                    size="small"
                                    sx={{ minWidth: '80px' }}
                                >
                                    {isSavingStreetView ? 'Saving...' : 'Save'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => {
                                        setIsEditingStreetView(false);
                                        setStreetViewUrl(tower?.streetViewUrl || '');
                                    }}
                                    size="small"
                                >
                                    Cancel
                                </Button>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                {streetViewUrl ? (
                                    <>
                                        <Typography variant="body2" sx={{ flex: 1, color: 'success.main' }}>
                                            ✓ Street View URL saved
                                        </Typography>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<StreetviewIcon />}
                                            onClick={handleOpenSavedStreetView}
                                        >
                                            Open
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => setIsEditingStreetView(true)}
                                        >
                                            Edit
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary', fontStyle: 'italic' }}>
                                            No custom Street View URL saved
                                        </Typography>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={() => setIsEditingStreetView(true)}
                                        >
                                            Add URL
                                        </Button>
                                    </>
                                )}
                            </Box>
                        )}
                    </Paper>

                    {/* Map Section */}
                    <Paper sx={{ mb: 3, overflow: 'hidden' }}>
                        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
                            <Typography variant="h6">
                                <LocationOnIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                                Location Map
                            </Typography>
                        </Box>
                        <Box sx={{ height: 400, position: 'relative' }}>
                            {mounted ? (
                                <Map
                                    center={[tower.lat, tower.lon]}
                                    zoom={15}
                                    towers={[tower]}
                                    onTowerSelect={() => { }}
                                    selectedTower={tower}
                                />
                            ) : (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CircularProgress />
                                </Box>
                            )}
                        </Box>
                    </Paper>

                    {/* Parcel & Owner Section */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            <PersonIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                            Parcel & Owner Information
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        {tower.parcel ? (
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">Address</Typography>
                                    <Typography variant="body1">{tower.parcel.address || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">City</Typography>
                                    <Typography variant="body1">{tower.parcel.city || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">State</Typography>
                                    <Typography variant="body1">{tower.parcel.state || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">ZIP</Typography>
                                    <Typography variant="body1">{tower.parcel.zip || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">Parcel ID</Typography>
                                    <Typography variant="body1">{tower.parcel.parcelId || 'N/A'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="body2" color="text.secondary">Data Source</Typography>
                                    <Typography variant="body1">{tower.parcel.dataSource || tower.source || 'N/A'}</Typography>
                                </Box>
                                {tower.parcel.owner && (
                                    <>
                                        <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                                            <Divider sx={{ my: 1 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Owner Name</Typography>
                                            <Typography variant="body1">{tower.parcel.owner.name || 'N/A'}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Owner Type</Typography>
                                            <Typography variant="body1">{tower.parcel.owner.type || 'N/A'}</Typography>
                                        </Box>
                                        <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                                            <Typography variant="body2" color="text.secondary">Owner Address</Typography>
                                            <Typography variant="body1">{tower.parcel.owner.address || 'N/A'}</Typography>
                                        </Box>
                                    </>
                                )}
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                No parcel data. Use "Lookup Owner" to fetch parcel information.
                            </Typography>
                        )}
                    </Paper>

                    {/* Notes Section */}
                    <Paper sx={{ p: 3 }}>
                        <NotesPanel
                            towerId={tower.id}
                            notes={notes}
                            onNotesChange={handleNotesChange}
                        />
                    </Paper>
                </Box>
            </Box>

            {/* Status Change Note Dialog */}
            <Dialog
                open={statusNoteDialogOpen}
                onClose={() => !saving && setStatusNoteDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    Change Status to "{getStatusLabel(pendingStatus)}"
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Would you like to add a note about this status change? (Optional)
                    </Typography>
                    <TextField
                        label="Note (optional)"
                        multiline
                        rows={3}
                        fullWidth
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value)}
                        sx={{ mb: 2 }}
                        placeholder="e.g., Spoke with owner, they are interested..."
                    />
                    <TextField
                        label="Your Name"
                        fullWidth
                        value={statusNoteAuthor}
                        onChange={(e) => setStatusNoteAuthor(e.target.value)}
                        placeholder="Enter your name"
                        disabled={!statusNote.trim()}
                        helperText={statusNote.trim() ? "Required to save the note" : ""}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setStatusNoteDialogOpen(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => handleStatusSave(false)}
                        disabled={saving}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save Without Note'}
                    </Button>
                    <Button
                        onClick={() => handleStatusSave(true)}
                        variant="contained"
                        disabled={saving || (statusNote.trim() && !statusNoteAuthor.trim())}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save With Note'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
