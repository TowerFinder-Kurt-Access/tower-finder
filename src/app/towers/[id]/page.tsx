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
    AppBar,
    Tooltip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import MapIcon from '@mui/icons-material/Map';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StreetviewIcon from '@mui/icons-material/Streetview';
import BusinessIcon from '@mui/icons-material/Business';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import NotesPanel from '@/components/NotesPanel';
import AddOwnerDialog from '@/components/AddOwnerDialog';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
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

interface LookupItem {
    id: number;
    name: string;
}

interface Tower {
    id: number;
    lat: number;
    lon: number;
    type?: { id: number; name: string } | string;
    typeId?: number;
    status?: string;
    licensee?: { id: number; name: string } | string;
    licenseeId?: number;
    carrier?: { id: number; name: string } | string;
    carrierId?: number;
    source?: string;
    streetViewUrl?: string;
    parcel?: {
        address?: string;
        streetNumber?: string;
        streetName?: string;
        streetType?: string;
        streetDir?: string;
        unit?: string;
        postalCode?: string;
        cityRaw?: string;
        stateRaw?: string;
        provinceRaw?: string;
        city?: { name: string } | string;
        province?: { name: string; code?: string } | string;
        state?: string;
        zip?: string;
        county?: string;
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

// Helper to safely extract name from a relation field
function getName(val: any): string {
    if (!val) return '';
    if (typeof val === 'object') return val.name || '';
    return String(val);
}

function getId(val: any): number | undefined {
    if (!val) return undefined;
    if (typeof val === 'object') return val.id;
    return undefined;
}

const AUTHOR_STORAGE_KEY = 'tower-finder-note-author';
const ADD_NEW_VALUE = '__ADD_NEW__';

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
    const [addOwnerOpen, setAddOwnerOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [streetViewUrl, setStreetViewUrl] = useState('');
    const [isEditingStreetView, setIsEditingStreetView] = useState(false);
    const [isSavingStreetView, setIsSavingStreetView] = useState(false);

    // Lookups
    const [types, setTypes] = useState<LookupItem[]>([]);
    const [carriers, setCarriers] = useState<LookupItem[]>([]);
    const [licensees, setLicensees] = useState<LookupItem[]>([]);

    // Selected lookup values (by ID)
    const [selectedTypeId, setSelectedTypeId] = useState<number | ''>('');
    const [selectedCarrierId, setSelectedCarrierId] = useState<number | ''>('');
    const [selectedLicenseeId, setSelectedLicenseeId] = useState<number | ''>('');

    // Add new lookup dialog
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [addDialogType, setAddDialogType] = useState<'type' | 'carrier' | 'licensee'>('type');
    const [addDialogValue, setAddDialogValue] = useState('');
    const [addDialogSaving, setAddDialogSaving] = useState(false);

    // Editable address fields
    const [editingAddress, setEditingAddress] = useState(false);
    const [addressFields, setAddressFields] = useState({
        address: '',
        streetNumber: '',
        streetName: '',
        streetType: '',
        streetDir: '',
        unit: '',
        postalCode: '',
        cityRaw: '',
        provinceRaw: '',
        county: '',
    });
    const [savingAddress, setSavingAddress] = useState(false);

    // Navigation
    const [prevTowerId, setPrevTowerId] = useState<number | null>(null);
    const [nextTowerId, setNextTowerId] = useState<number | null>(null);

    // Status change note dialog
    const [statusNoteDialogOpen, setStatusNoteDialogOpen] = useState(false);
    const [pendingStatus, setPendingStatus] = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [statusNoteAuthor, setStatusNoteAuthor] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        loadTower();
        loadNavigation();
        loadLookups();
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
            const t = res.data;
            setTower(t);
            setStatus(t.status || '');
            setNotes(t.notes || []);
            setStreetViewUrl(t.streetViewUrl || '');
            setSelectedTypeId(getId(t.type) || t.typeId || '');
            setSelectedCarrierId(getId(t.carrier) || t.carrierId || '');
            setSelectedLicenseeId(getId(t.licensee) || t.licenseeId || '');
            // Populate address fields
            if (t.parcel) {
                setAddressFields({
                    address: t.parcel.address || '',
                    streetNumber: t.parcel.streetNumber || '',
                    streetName: t.parcel.streetName || '',
                    streetType: t.parcel.streetType || '',
                    streetDir: t.parcel.streetDir || '',
                    unit: t.parcel.unit || '',
                    postalCode: t.parcel.postalCode || t.parcel.zip || '',
                    cityRaw: (typeof t.parcel.city === 'object' ? t.parcel.city?.name : null) || t.parcel.cityRaw || '',
                    provinceRaw: (typeof t.parcel.province === 'object' ? t.parcel.province?.name : null) || t.parcel.provinceRaw || t.parcel.stateRaw || '',
                    county: t.parcel.county || '',
                });
            }
        } catch (error) {
            console.error('Failed to load tower:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadNavigation = async () => {
        try {
            const res = await axios.get(`/api/towers/${towerId}/nav`);
            setPrevTowerId(res.data.prevId);
            setNextTowerId(res.data.nextId);
        } catch {
            // Navigation API may not exist yet — we'll create it
            setPrevTowerId(towerId > 1 ? towerId - 1 : null);
            setNextTowerId(towerId + 1);
        }
    };

    const loadLookups = async () => {
        try {
            const res = await axios.get('/api/towers?distinct=lookups');
            setTypes(res.data.types || []);
            setCarriers(res.data.carriers || []);
            setLicensees(res.data.licensees || []);
        } catch (error) {
            console.error('Failed to load lookups:', error);
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

                let ownerName = '';
                if (parcelData.owner?.name) {
                    ownerName = parcelData.owner.name;
                } else if (res.data.result.owner && res.data.result.owner !== 'Unknown' && res.data.result.owner !== 'UNKNOWN') {
                    ownerName = res.data.result.owner;
                }

                if (ownerName && ownerName === parcelData.parcelId) {
                    ownerName = '';
                }

                setTower({ ...tower, parcel: parcelData });

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
            await axios.patch(`/api/towers/${tower.id}`, {
                status: pendingStatus
            });

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

    const handleLookupChange = async (field: 'typeId' | 'carrierId' | 'licenseeId', value: number | string) => {
        if (value === ADD_NEW_VALUE) {
            // Open add dialog
            const dialogType = field === 'typeId' ? 'type' : field === 'carrierId' ? 'carrier' : 'licensee';
            setAddDialogType(dialogType);
            setAddDialogValue('');
            setAddDialogOpen(true);
            return;
        }

        if (!tower || !value) return;

        setSaving(true);
        try {
            await axios.patch(`/api/towers/${tower.id}`, {
                [field]: Number(value)
            });
            loadTower();
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
        } finally {
            setSaving(false);
        }
    };

    const handleAddNewLookup = async () => {
        if (!addDialogValue.trim()) return;

        setAddDialogSaving(true);
        try {
            const res = await axios.post('/api/lookups', {
                type: addDialogType,
                name: addDialogValue.trim()
            });

            const newItem = res.data;

            // Update local lookups
            if (addDialogType === 'type') {
                setTypes(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
                // Auto-assign to current tower
                if (tower) {
                    await axios.patch(`/api/towers/${tower.id}`, { typeId: newItem.id });
                    setSelectedTypeId(newItem.id);
                }
            } else if (addDialogType === 'carrier') {
                setCarriers(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
                if (tower) {
                    await axios.patch(`/api/towers/${tower.id}`, { carrierId: newItem.id });
                    setSelectedCarrierId(newItem.id);
                }
            } else {
                setLicensees(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
                if (tower) {
                    await axios.patch(`/api/towers/${tower.id}`, { licenseeId: newItem.id });
                    setSelectedLicenseeId(newItem.id);
                }
            }

            setAddDialogOpen(false);
            loadTower();
        } catch (error: any) {
            console.error('Error adding lookup:', error);
            alert(error.response?.data?.error || 'Failed to add new item');
        } finally {
            setAddDialogSaving(false);
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

    const handleSaveAddress = async () => {
        if (!tower) return;
        setSavingAddress(true);
        try {
            await axios.patch(`/api/towers/${tower.id}`, {
                parcelUpdate: addressFields
            });
            setEditingAddress(false);
            loadTower();
        } catch (error) {
            console.error('Error saving address:', error);
            alert('Failed to save address');
        } finally {
            setSavingAddress(false);
        }
    };

    const handleAddressFieldChange = (field: string, value: string) => {
        setAddressFields(prev => ({ ...prev, [field]: value }));
    };

    const handleOpenSavedStreetView = () => {
        if (streetViewUrl) {
            window.open(streetViewUrl, '_blank');
        }
    };

    const navigateTo = (id: number | null) => {
        if (id !== null) {
            router.push(`/towers/${id}`);
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

    // Extract display values
    const typeName = getName(tower.type);
    const licenseeName = getName(tower.licensee);
    const carrierName = getName(tower.carrier);
    const cityName = getName(tower.parcel?.city) || tower.parcel?.cityRaw || '';
    const provinceName = getName(tower.parcel?.province) || tower.parcel?.provinceRaw || tower.parcel?.stateRaw || tower.parcel?.state || '';
    const postalCode = tower.parcel?.postalCode || tower.parcel?.zip || '';

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Action Bar */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar sx={{ gap: 1 }}>
                    <IconButton edge="start" onClick={() => router.push('/towers')}>
                        <ArrowBackIcon />
                    </IconButton>

                    {/* Previous / Next Navigation */}
                    <Tooltip title="Previous Tower">
                        <span>
                            <IconButton
                                onClick={() => navigateTo(prevTowerId)}
                                disabled={!prevTowerId}
                                size="small"
                            >
                                <NavigateBeforeIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Typography variant="h6" sx={{ minWidth: 'auto' }}>
                        Tower #{tower.id}
                    </Typography>

                    <Tooltip title="Next Tower">
                        <span>
                            <IconButton
                                onClick={() => navigateTo(nextTowerId)}
                                disabled={!nextTowerId}
                                size="small"
                            >
                                <NavigateNextIcon />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Box sx={{ flexGrow: 1 }} />

                    <Button startIcon={<MapIcon />} onClick={handleViewOnMap} size="small">
                        View on Map
                    </Button>
                    <Button startIcon={<OpenInNewIcon />} onClick={handleOpenGoogleMaps} size="small">
                        Google Maps
                    </Button>
                    <Button startIcon={<StreetviewIcon />} onClick={handleOpenSatelliteView} size="small">
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
                    <Button startIcon={<TravelExploreIcon />} onClick={handleOpenBingMaps} size="small">
                        Search Nearby
                    </Button>
                    <Button startIcon={<PersonAddIcon />} onClick={() => setAddOwnerOpen(true)} size="small" color="warning">
                        Add Owner
                    </Button>
                </Toolbar>
            </AppBar>

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#f5f5f5' }}>
                <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
                    {/* Quick Info Card */}
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

                        {/* Address */}
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Address
                            </Typography>
                            <Typography variant="h6" sx={{ mt: 0.5 }}>
                                {tower.parcel?.address || 'Address not available'}
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                {[cityName, provinceName, postalCode].filter(Boolean).join(', ') || 'Location details not available'}
                            </Typography>
                        </Box>

                        {/* Key Details Grid - Dropdowns for Type/Licensee/Carrier */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
                            {/* Type Dropdown */}
                            <FormControl fullWidth size="small">
                                <InputLabel>Type</InputLabel>
                                <Select
                                    value={selectedTypeId}
                                    label="Type"
                                    onChange={(e) => {
                                        const val = String(e.target.value);
                                        if (val === ADD_NEW_VALUE) {
                                            handleLookupChange('typeId', ADD_NEW_VALUE);
                                        } else {
                                            setSelectedTypeId(Number(val));
                                            handleLookupChange('typeId', Number(val));
                                        }
                                    }}
                                    disabled={saving}
                                >
                                    {types.map(t => (
                                        <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                                    ))}
                                    <Divider />
                                    <MenuItem value={ADD_NEW_VALUE}>
                                        <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add New Type
                                    </MenuItem>
                                </Select>
                            </FormControl>

                            {/* Licensee Dropdown */}
                            <FormControl fullWidth size="small">
                                <InputLabel>Licensee</InputLabel>
                                <Select
                                    value={selectedLicenseeId}
                                    label="Licensee"
                                    onChange={(e) => {
                                        const val = String(e.target.value);
                                        if (val === ADD_NEW_VALUE) {
                                            handleLookupChange('licenseeId', ADD_NEW_VALUE);
                                        } else {
                                            setSelectedLicenseeId(Number(val));
                                            handleLookupChange('licenseeId', Number(val));
                                        }
                                    }}
                                    disabled={saving}
                                >
                                    {licensees.map(l => (
                                        <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                                    ))}
                                    <Divider />
                                    <MenuItem value={ADD_NEW_VALUE}>
                                        <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add New Licensee
                                    </MenuItem>
                                </Select>
                            </FormControl>

                            {/* Carrier Dropdown */}
                            <FormControl fullWidth size="small">
                                <InputLabel>Carrier</InputLabel>
                                <Select
                                    value={selectedCarrierId}
                                    label="Carrier"
                                    onChange={(e) => {
                                        const val = String(e.target.value);
                                        if (val === ADD_NEW_VALUE) {
                                            handleLookupChange('carrierId', ADD_NEW_VALUE);
                                        } else {
                                            setSelectedCarrierId(Number(val));
                                            handleLookupChange('carrierId', Number(val));
                                        }
                                    }}
                                    disabled={saving}
                                >
                                    {carriers.map(c => (
                                        <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                    ))}
                                    <Divider />
                                    <MenuItem value={ADD_NEW_VALUE}>
                                        <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add New Carrier
                                    </MenuItem>
                                </Select>
                            </FormControl>

                            {/* Coordinates */}
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Coordinates</Typography>
                                <Typography variant="body1" sx={{ fontSize: '1.1rem' }}>{tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}</Typography>
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
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="h6">
                                <PersonIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                                Parcel & Owner Information
                            </Typography>
                            {tower.parcel && !editingAddress && (
                                <Button
                                    startIcon={<EditIcon />}
                                    size="small"
                                    onClick={() => setEditingAddress(true)}
                                >
                                    Edit Address
                                </Button>
                            )}
                            {editingAddress && (
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                        startIcon={<SaveIcon />}
                                        size="small"
                                        variant="contained"
                                        onClick={handleSaveAddress}
                                        disabled={savingAddress}
                                    >
                                        {savingAddress ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                        startIcon={<CancelIcon />}
                                        size="small"
                                        onClick={() => {
                                            setEditingAddress(false);
                                            // Reset fields from tower data
                                            if (tower.parcel) {
                                                setAddressFields({
                                                    address: tower.parcel.address || '',
                                                    streetNumber: tower.parcel.streetNumber || '',
                                                    streetName: tower.parcel.streetName || '',
                                                    streetType: tower.parcel.streetType || '',
                                                    streetDir: tower.parcel.streetDir || '',
                                                    unit: tower.parcel.unit || '',
                                                    postalCode: tower.parcel.postalCode || tower.parcel.zip || '',
                                                    cityRaw: cityName,
                                                    provinceRaw: provinceName,
                                                    county: tower.parcel.county || '',
                                                });
                                            }
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </Box>
                            )}
                        </Box>
                        <Divider sx={{ mb: 2 }} />
                        {tower.parcel || editingAddress ? (
                            editingAddress ? (
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                                    <TextField
                                        label="Full Address"
                                        size="small"
                                        fullWidth
                                        value={addressFields.address}
                                        onChange={(e) => handleAddressFieldChange('address', e.target.value)}
                                        sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}
                                    />
                                    <TextField
                                        label="Street Number"
                                        size="small"
                                        value={addressFields.streetNumber}
                                        onChange={(e) => handleAddressFieldChange('streetNumber', e.target.value)}
                                    />
                                    <TextField
                                        label="Street Name"
                                        size="small"
                                        value={addressFields.streetName}
                                        onChange={(e) => handleAddressFieldChange('streetName', e.target.value)}
                                    />
                                    <TextField
                                        label="Street Type"
                                        size="small"
                                        value={addressFields.streetType}
                                        onChange={(e) => handleAddressFieldChange('streetType', e.target.value)}
                                        helperText="e.g. St, Ave, Blvd"
                                    />
                                    <TextField
                                        label="Street Direction"
                                        size="small"
                                        value={addressFields.streetDir}
                                        onChange={(e) => handleAddressFieldChange('streetDir', e.target.value)}
                                        helperText="e.g. N, S, E, W"
                                    />
                                    <TextField
                                        label="Unit"
                                        size="small"
                                        value={addressFields.unit}
                                        onChange={(e) => handleAddressFieldChange('unit', e.target.value)}
                                    />
                                    <TextField
                                        label="City"
                                        size="small"
                                        value={addressFields.cityRaw}
                                        onChange={(e) => handleAddressFieldChange('cityRaw', e.target.value)}
                                    />
                                    <TextField
                                        label="Province"
                                        size="small"
                                        value={addressFields.provinceRaw}
                                        onChange={(e) => handleAddressFieldChange('provinceRaw', e.target.value)}
                                    />
                                    <TextField
                                        label="Postal Code"
                                        size="small"
                                        value={addressFields.postalCode}
                                        onChange={(e) => handleAddressFieldChange('postalCode', e.target.value)}
                                    />
                                    <TextField
                                        label="County"
                                        size="small"
                                        value={addressFields.county}
                                        onChange={(e) => handleAddressFieldChange('county', e.target.value)}
                                    />
                                </Box>
                            ) : (
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Address</Typography>
                                        <Typography variant="body1">{tower.parcel?.address || 'N/A'}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">City</Typography>
                                        <Typography variant="body1">{cityName || 'N/A'}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Province</Typography>
                                        <Typography variant="body1">{provinceName || 'N/A'}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Postal Code</Typography>
                                        <Typography variant="body1">{postalCode || 'N/A'}</Typography>
                                    </Box>
                                    {tower.parcel?.county && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">County</Typography>
                                            <Typography variant="body1">{tower.parcel.county}</Typography>
                                        </Box>
                                    )}
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Data Source</Typography>
                                        <Typography variant="body1">{tower.parcel?.dataSource || tower.source || 'N/A'}</Typography>
                                    </Box>
                                    {tower.parcel?.owner && (
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
                            )
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
                    <Button onClick={() => setStatusNoteDialogOpen(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleStatusSave(false)} disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : 'Save Without Note'}
                    </Button>
                    <Button
                        onClick={() => handleStatusSave(true)}
                        variant="contained"
                        disabled={saving || (statusNote.trim() && !statusNoteAuthor.trim()) ? true : false}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save With Note'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Add Owner Dialog */}
            <AddOwnerDialog
                open={addOwnerOpen}
                onClose={() => setAddOwnerOpen(false)}
                onSuccess={() => loadTower()}
                towerId={towerId}
            />

            {/* Add New Lookup Dialog */}
            <Dialog
                open={addDialogOpen}
                onClose={() => !addDialogSaving && setAddDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    Add New {addDialogType === 'type' ? 'Tower Type' : addDialogType === 'carrier' ? 'Carrier' : 'Licensee'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        label="Name"
                        fullWidth
                        value={addDialogValue}
                        onChange={(e) => setAddDialogValue(e.target.value)}
                        sx={{ mt: 1 }}
                        placeholder={`Enter new ${addDialogType} name`}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && addDialogValue.trim()) {
                                handleAddNewLookup();
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)} disabled={addDialogSaving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAddNewLookup}
                        variant="contained"
                        disabled={addDialogSaving || !addDialogValue.trim()}
                    >
                        {addDialogSaving ? <CircularProgress size={20} /> : 'Add'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
