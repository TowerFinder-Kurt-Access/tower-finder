'use client';

// Street View links are admin-entered text, so only known map hosts may open in a tab.
const EXTERNAL_HOSTS = new Set(['www.google.com', 'maps.google.com', 'www.bing.com', 'webmap.onxmaps.com', 'map.publicgis.com', 'maps.ltsa.ca']);

const openExternal = (url: string): void => {
    try {
        const { hostname, protocol } = new URL(url);
        if (protocol !== 'https:' && protocol !== 'http:') throw new Error('Blocked non-http link');
        if (!EXTERNAL_HOSTS.has(hostname)) throw new Error(`Blocked host: ${hostname}`);
        window.open(url, '_blank', 'noopener');
    } catch (e) {
        console.error('Blocked external link:', e);
    }
};

import { useState, useEffect, useMemo, useRef, use, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import dynamic from 'next/dynamic';
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
    Stack,
    Toolbar,
    AppBar,
    Tooltip,
    Menu,
    ListItemIcon,
    ListItemText
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
import PhoneIcon from '@mui/icons-material/Phone';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import NotesPanel from '@/components/NotesPanel';
import TowerDocuments from '@/components/TowerDocuments';
import AddOwnerDialog from '@/components/AddOwnerDialog';
import MapDetailsPanel from '@/components/MapDetailsPanel';
import {
    DEFAULT_MAP_MODES,
    DEFAULT_MAP_STYLE,
    type MapModeState,
    type MapStyleId,
} from '@/components/ui/cluster-styles';
import { getRadiusTiers } from '@/lib/nearby-business';
import { pinnedMapUrl, towerToPlaceUrl } from '@/lib/google-maps';
import LeaseExpiryCell from '@/components/LeaseExpiryCell';
import { formatLeaseExpiry, minLeaseExpiryDate } from '@/lib/lease-expiry';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import LayersIcon from '@mui/icons-material/Layers';

// Dynamically import Map to avoid SSR issues
const Map = dynamic(() => import('@/components/TowerMap'), {
    ssr: false,
    loading: () => <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box>
});

interface NoteHistory {
    id: number;
    content: string;
    initials: string | null;
    updatedAt: string;
}

interface Note {
    id: number;
    content: string;
    initials?: string | null;
    author: {
        id: number;
        name: string | null;
        email: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
    history?: NoteHistory[];
}

interface BcParcel {
    pid: string | null;
    ownerType: string | null;
    municipality: string | null;
    planNumber: string | null;
    areaSqm: number | null;
}

interface Phone {
    id: number;
    number: string;
    status: string;
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
    carrier?: { id: number; name: string } | string;
    carrierId?: number;
    source?: string;
    streetViewUrl?: string;
    parcel?: {
        address?: string;
        leaseExpiry?: string | null;
        streetNumber?: string;
        streetName?: string;
        streetType?: string;
        streetDir?: string;
        unit?: string;
        postalCode?: string;
        country?: string | null;
        cityRaw?: string;
        stateRaw?: string;
        provinceRaw?: string;
        city?: { name: string } | string;
        province?: { name: string; code?: string } | string;
        state?: string;
        zip?: string;
        county?: { name: string } | string;
        countyNormalized?: { name: string } | string;
        countyRaw?: string;
        parcelId?: string;
        dataSource?: string;
        rawData?: any;
        ihunterCloseupUrl?: string | null;
        ihunterOverlayUrl?: string | null;
        ihunterScrapedAt?: string | null;
        owner?: {
            id?: number;
            name?: string;
            address?: string;
            type?: string;
            contacts?: { id: number; type: string; value: string; label: string; isValid: boolean }[];
        };
    };
    phones?: Phone[];
    notes?: Note[];
    leaseExpiryHistory?: { id: number; oldValue: string | null; newValue: string | null; userName: string | null; createdAt: string }[];
    businessesNearby?: {
        id: number;
        name: string;
        phone: string | null;
        distance: number;
        rawData: any;
    }[];
}

type NearbyBusiness = NonNullable<Tower['businessesNearby']>[number];

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

const ADD_NEW_VALUE = '__ADD_NEW__';

export default function TowerDetailPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const towerId = parseInt(resolvedParams.id);
    const router = useRouter();

    const [tower, setTower] = useState<Tower | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [notes, setNotes] = useState<Note[]>([]);
    const [isOwnerLoading, setIsOwnerLoading] = useState(false);
    const [addOwnerOpen, setAddOwnerOpen] = useState(false);
    const [streetViewUrl, setStreetViewUrl] = useState('');
    const [isEditingStreetView, setIsEditingStreetView] = useState(false);
    const [selectedBizId, setSelectedBizId] = useState<number | null>(null);
    const [mapSelectedTower, setMapSelectedTower] = useState<Tower | null>(null);
    const [mapStyle, setMapStyle] = useState<MapStyleId>(DEFAULT_MAP_STYLE);
    const [mapModes, setMapModes] = useState<MapModeState>(DEFAULT_MAP_MODES);
    const [bizPage, setBizPage] = useState(0);
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    const [isSavingStreetView, setIsSavingStreetView] = useState(false);
    const [isNormalizing, setIsNormalizing] = useState(false);
    const [mapMenuAnchor, setMapMenuAnchor] = useState<HTMLElement | null>(null);
    const [ownerMenuAnchor, setOwnerMenuAnchor] = useState<HTMLElement | null>(null);
    const [bcParcel, setBcParcel] = useState<{ status: 'idle' | 'found' | 'none'; parcel?: BcParcel }>({ status: 'idle' });

    // Lookups
    const [types, setTypes] = useState<LookupItem[]>([]);
    const [carriers, setCarriers] = useState<LookupItem[]>([]);
    const [statuses, setStatuses] = useState<LookupItem[]>([]);

    // Selected lookup values (by ID)
    const [selectedTypeId, setSelectedTypeId] = useState<number | ''>('');
    const [selectedCarrierId, setSelectedCarrierId] = useState<number | ''>('');
    const [selectedStatusId, setSelectedStatusId] = useState<number | ''>('');

    // Add new lookup dialog
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [addDialogType, setAddDialogType] = useState<'type' | 'carrier' | 'status'>('type');
    const [addDialogValue, setAddDialogValue] = useState('');
    const [addDialogSaving, setAddDialogSaving] = useState(false);

    // Inline lookup management (rename/delete options directly from the dropdowns)
    const [typeMenuOpen, setTypeMenuOpen] = useState(false);
    const [carrierMenuOpen, setCarrierMenuOpen] = useState(false);
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [editLookupDialog, setEditLookupDialog] = useState<{ open: boolean; type: 'type' | 'carrier' | 'status'; id: number }>({ open: false, type: 'type', id: 0 });
    const [editLookupValue, setEditLookupValue] = useState('');
    const [lookupActionSaving, setLookupActionSaving] = useState(false);

    // Editable parcel fields (address + lease expiry), written by the Property form.
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

    // Lease expiry draft, edited through the Property dialog (lives on the parcel)
    const [leaseExpiryDraft, setLeaseExpiryDraft] = useState('');
    // Owner fields shown in the same dialog, mirroring Add Property Owner.
    const [propertyForm, setPropertyForm] = useState<{
        name: string;
        type: string;
        address: string;
        contacts: { type: 'Phone' | 'Email'; value: string; label: string; isValid: boolean }[];
    }>({ name: '', type: '', address: '', contacts: [] });
    const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
    const [savingProperty, setSavingProperty] = useState(false);
    const [savingAddress, setSavingAddress] = useState(false);

    // Navigation
    const [prevTowerId, setPrevTowerId] = useState<number | null>(null);
    const [nextTowerId, setNextTowerId] = useState<number | null>(null);

    // Status change note dialog
    const [statusNoteDialogOpen, setStatusNoteDialogOpen] = useState(false);
    const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);
    const [statusNote, setStatusNote] = useState('');

    // A new tower starts at the top; saving the same tower keeps the position.
    useEffect(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }, [tower?.id]);

    // Hydration-safe mounted flag: true in the browser, false during the server render.
    const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

    const loadTower = async () => {
        try {
            // Keep the page mounted on refreshes so saving a field does not
            // reset the user's scroll position.
            if (!tower) setLoading(true);
            const res = await axios.get(`/api/towers/${towerId}`);
            const t = res.data;
            setTower(t);
            setMapSelectedTower(t);
            setStatus(t.status?.name || t.legacyStatus || '');
            setSelectedStatusId(getId(t.status) || t.statusId || '');
            setNotes(t.notes || []);
            setStreetViewUrl(t.streetViewUrl || '');
            setSelectedTypeId(getId(t.type) || t.typeId || '');
            setSelectedCarrierId(getId(t.carrier) || t.carrierId || '');
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
                    county: t.parcel.county?.name || t.parcel.countyRaw || '',
                });
            }
        } catch (error) {
            console.error('Failed to load tower:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshKeepingScroll = async (top = contentRef.current?.scrollTop ?? 0) => {
        await loadTower();
        // Let React commit the refreshed layout before restoring.
        window.setTimeout(() => {
            contentRef.current?.scrollTo({ top, behavior: 'auto' });
        }, 250);
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
            setStatuses(res.data.statuses || []);
        } catch (error) {
            console.error('Failed to load lookups:', error);
        }
    };

    // Start the fetches on the next tick so the effect body itself does no state work.
    useEffect(() => {
        const timer = setTimeout(() => {
            loadTower();
            loadNavigation();
            loadLookups();
        }, 0);
        return () => clearTimeout(timer);
    }, [towerId]);

    const handleViewOnMap = () => {
        if (tower) {
            router.push(`/?selectTower=${tower.id}`);
        }
    };

    const handleOpenGoogleMaps = () => {
        if (tower) {
            openExternal(pinnedMapUrl(tower.lat, tower.lon));
        }
    };

    const handleOpenSatelliteView = () => {
        if (tower) {
            openExternal(pinnedMapUrl(tower.lat, tower.lon, { satellite: true, zoom: 20 }));
        }
    };

    // --- Nearby business helpers ---
    const bizCoords = (biz: any): [number, number] | null => {
        const c = biz?.rawData?.geometry?.coordinates;
        if (Array.isArray(c) && c.length >= 2) return [c[1], c[0]];
        const p = biz?.rawData?.properties;
        if (p?.lat != null && p?.lon != null) return [p.lat, p.lon];
        return null;
    };

    const bizAddress = (biz: any): string => {
        const p = biz?.rawData?.properties || {};
        if (p.formatted) return p.formatted;
        const line1 = [p.housenumber, p.street].filter(Boolean).join(' ');
        const parts = [line1 || p.address_line1, p.suburb || p.district, p.city, p.state]
            .filter(Boolean);
        return parts.join(', ');
    };

    // `formatted` already leads with the name; a bare name alone would match a branch anywhere.
    const bizMapsQuery = (biz: NearbyBusiness): string => {
        const formatted = biz.rawData?.properties?.formatted;
        if (typeof formatted === 'string' && formatted.length > 0) return formatted;
        const addr = bizAddress(biz);
        return addr ? `${biz.name}, ${addr}` : '';
    };

    const handleSelectBizOnMap = (biz: any) => {
        const c = bizCoords(biz);
        if (!c) return;
        setSelectedBizId(biz.id);
        setMapCenter(c);
        document.getElementById('tower-location-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // The tower is the origin so both pins stay in view, including when the
    // user zooms out to look around.
    const handleBizSatellite = (biz: NearbyBusiness) => {
        if (!tower) return;
        const c = bizCoords(biz);
        const query = bizMapsQuery(biz) || (c ? `${c[0]},${c[1]}` : '');
        if (!query) return;
        openExternal(towerToPlaceUrl(tower.lat, tower.lon, query));
    };

    const BIZ_PAGE_SIZE = 12;

    const bizTiers = useMemo(() => getRadiusTiers(tower?.businessesNearby ?? []), [tower?.businessesNearby]);

    // Default to the widest tier, which holds every stored business.
    const maxUsefulRadius = bizTiers[bizTiers.length - 1]?.radius ?? 0;

    // Rows are stored nearest-first, so the first one carrying a phone is the answer.
    const nearestCallableBiz = useMemo(() => {
        const list = tower?.businessesNearby;
        if (!list || list.length === 0) return null;
        return list.find((b) => !!b.phone) ?? null;
    }, [tower?.businessesNearby]);

    // Explains why the banner skips closer businesses that list no number.
    const closerWithoutPhone = useMemo(() => {
        const list = tower?.businessesNearby ?? [];
        if (!nearestCallableBiz) return 0;
        return list.filter((b) => !b.phone && b.distance < nearestCallableBiz.distance).length;
    }, [tower?.businessesNearby, nearestCallableBiz]);

    // null means "use the widest tier that holds something"; only a pick overrides it.
    const [bizRadiusPick, setBizRadiusPick] = useState<number | null>(null);
    const [lastTowerId, setLastTowerId] = useState<number | null>(null);
    const bizRadius = bizRadiusPick ?? maxUsefulRadius;

    const bizWithinRadius = useMemo(() => {
        const list = tower?.businessesNearby ?? [];
        return list.filter((b) => b.distance <= bizRadius);
    }, [tower?.businessesNearby, bizRadius]);

    // Reset during render so the next tower does not flash the previous tower's page.
    if (tower && tower.id !== lastTowerId) {
        setLastTowerId(tower.id);
        setBizRadiusPick(null);
        setBizPage(0);
    }

    const bizTotalPages = Math.max(1, Math.ceil(bizWithinRadius.length / BIZ_PAGE_SIZE));
    const bizPageItems = useMemo(() => {
        const start = bizPage * BIZ_PAGE_SIZE;
        return bizWithinRadius.slice(start, start + BIZ_PAGE_SIZE);
    }, [bizWithinRadius, bizPage]);

    const handleOpenBingMaps = () => {
        if (tower) {
            openExternal(`https://www.bing.com/maps?cp=${tower.lat}~${tower.lon}&lvl=17&style=r`);
        }
    };

    const handleOpenOnXMaps = () => {
        if (tower) {
            openExternal(`https://webmap.onxmaps.com/hunt/map/query/${tower.lat},${tower.lon},14.57/overview#15.5/${tower.lat}/${tower.lon}`);
        }
    };

    // PublicGIS restores the view from a #zoom/lat/lng hash.
    const handleOpenPublicGis = () => {
        if (tower) {
            openExternal('https://map.publicgis.com/#16/' + tower.lat + '/' + tower.lon);
        }
    };

    // ParcelMap BC reads ?center=lon,lat&zoom=N from the URL.
    const handleOpenParcelMapBc = () => {
        if (tower) {
            openExternal('https://maps.ltsa.ca/?center=' + tower.lon + ',' + tower.lat + '&zoom=17');
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
                    alert(`Property Owner found: ${ownerName}`);
                } else {
                    alert('Parcel found, but property owner information is not available');
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
        const val = String(event.target.value);
        if (val === ADD_NEW_VALUE) {
            setAddDialogType('status');
            setAddDialogValue('');
            setAddDialogOpen(true);
            return;
        }
        setPendingStatusId(Number(val));
        setStatusNote('');
        setStatusNoteDialogOpen(true);
    };

    const handleStatusSave = async (addNote: boolean) => {
        if (!tower) return;

        setSaving(true);
        try {
            const statusName = statuses.find(s => s.id === pendingStatusId)?.name || 'Unknown';
            await axios.patch(`/api/towers/${tower.id}`, {
                statusId: pendingStatusId
            });

            if (addNote && statusNote.trim()) {
                const noteContent = `[Status changed to "${statusName}"]\n${statusNote.trim()}`;
                await axios.post(`/api/towers/${tower.id}/notes`, {
                    content: noteContent
                });
            }

            setSelectedStatusId(pendingStatusId as number);
            setStatus(statusName);
            setStatusNoteDialogOpen(false);
            await refreshKeepingScroll();
        } catch (error) {
            console.error('Error updating status:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleLookupChange = async (field: 'typeId' | 'carrierId', value: number | string) => {
        if (value === ADD_NEW_VALUE) {
            // Open add dialog
            const dialogType = field === 'typeId' ? 'type' : 'carrier';
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
            await refreshKeepingScroll();
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
            } else if (addDialogType === 'status') {
                setStatuses(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
                if (tower) {
                    await axios.patch(`/api/towers/${tower.id}`, { statusId: newItem.id });
                    setSelectedStatusId(newItem.id);
                    setStatus(newItem.name);
                }
            }

            setAddDialogOpen(false);
            await refreshKeepingScroll();
        } catch (error: any) {
            console.error('Error adding lookup:', error);
            alert(error.response?.data?.error || 'Failed to add new item');
        } finally {
            setAddDialogSaving(false);
        }
    };

    const closeLookupMenu = (type: 'type' | 'carrier' | 'status') => {
        if (type === 'type') setTypeMenuOpen(false);
        else if (type === 'carrier') setCarrierMenuOpen(false);
        else setStatusMenuOpen(false);
    };

    const openEditLookup = (type: 'type' | 'carrier' | 'status', item: LookupItem) => {
        closeLookupMenu(type);
        setEditLookupDialog({ open: true, type, id: item.id });
        setEditLookupValue(item.name);
    };

    const handleEditLookupSave = async () => {
        const name = editLookupValue.trim();
        if (!name) return;
        const { type, id } = editLookupDialog;
        setLookupActionSaving(true);
        try {
            const res = await axios.put(`/api/lookups/${type}/${id}`, { name });
            const updatedName = res.data?.name ?? name;
            const apply = (prev: LookupItem[]) =>
                prev.map(i => (i.id === id ? { ...i, name: updatedName } : i))
                    .sort((a, b) => a.name.localeCompare(b.name));
            if (type === 'type') setTypes(apply);
            else if (type === 'carrier') setCarriers(apply);
            else {
                setStatuses(apply);
                if (selectedStatusId === id) setStatus(updatedName);
            }
            setEditLookupDialog(d => ({ ...d, open: false }));
            await refreshKeepingScroll();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to rename');
        } finally {
            setLookupActionSaving(false);
        }
    };

    const handleDeleteLookup = async (type: 'type' | 'carrier' | 'status', item: LookupItem) => {
        closeLookupMenu(type);
        if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return;
        setLookupActionSaving(true);
        try {
            await axios.delete(`/api/lookups/${type}/${item.id}`);
            const apply = (prev: LookupItem[]) => prev.filter(i => i.id !== item.id);
            if (type === 'type') {
                setTypes(apply);
                if (selectedTypeId === item.id) setSelectedTypeId('');
            } else if (type === 'carrier') {
                setCarriers(apply);
                if (selectedCarrierId === item.id) setSelectedCarrierId('');
            } else {
                setStatuses(apply);
                if (selectedStatusId === item.id) { setSelectedStatusId(''); setStatus(''); }
            }
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to delete — it may be in use by a tower.');
        } finally {
            setLookupActionSaving(false);
        }
    };

    // Renders lookup options with inline rename/delete controls. Status uses a string
    // value to match its Select; type/carrier use the numeric id.
    const renderLookupMenuItems = (type: 'type' | 'carrier' | 'status', items: LookupItem[]) =>
        items.map(item => (
            <MenuItem
                key={item.id}
                value={type === 'status' ? String(item.id) : item.id}
                sx={{ display: 'flex', alignItems: 'center', pr: 1 }}
            >
                <Box component="span" sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                </Box>
                <Box
                    sx={{ display: 'flex', gap: 0.25, ml: 1 }}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <Tooltip title="Rename">
                        <IconButton
                            size="small"
                            onClick={e => { e.stopPropagation(); openEditLookup(type, item); }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <EditIcon fontSize="inherit" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            color="error"
                            onClick={e => { e.stopPropagation(); handleDeleteLookup(type, item); }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <DeleteIcon fontSize="inherit" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </MenuItem>
        ));

    const handleNotesChange = () => {
        loadTower();
    };

    const handleNormalize = async () => {
        if (!tower) return;
        setIsNormalizing(true);
        try {
            await axios.post(`/api/towers/${tower.id}/normalize`);
            alert('Location normalization completed!');
            await refreshKeepingScroll();
        } catch (error: any) {
            console.error('Normalization failed:', error);
            alert('Failed to normalize location: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsNormalizing(false);
        }
    };

    const handleSaveStreetViewUrl = async () => {
        if (!tower) return;
        const nextUrl = streetViewUrl.trim() || null;
        setIsSavingStreetView(true);
        try {
            // Trust the write response. A refetch here can return a stale row and
            // overwrite the URL that just saved, so the field looked unsaved.
            const res = await axios.patch(`/api/towers/${tower.id}`, {
                streetViewUrl: nextUrl
            });
            const savedUrl: string | null = res.data?.streetViewUrl ?? nextUrl;
            setTower(prev => (prev ? { ...prev, streetViewUrl: savedUrl ?? undefined } : prev));
            setStreetViewUrl(savedUrl ?? '');
            setIsEditingStreetView(false);
        } catch (error) {
            console.error('Error saving street view URL:', error);
            alert('Failed to save Street View URL');
        } finally {
            setIsSavingStreetView(false);
        }
    };

    const handleSaveAddress = async () => {
        if (!tower) return;
        const top = contentRef.current?.scrollTop ?? 0;
        setSavingAddress(true);
        try {
            await axios.patch(`/api/towers/${tower.id}`, {
                parcelUpdate: { ...addressFields }
            });
            setEditingAddress(false);
            await refreshKeepingScroll(top);
        } catch (error: unknown) {
            console.error('Error saving address:', error);
            const message = axios.isAxiosError(error)
                ? (error.response?.data as { error?: string } | undefined)?.error
                : undefined;
            alert(message || 'Failed to save address');
        } finally {
            setSavingAddress(false);
        }
    };

    const openPropertyDialog = () => {
        const owner = tower?.parcel?.owner;
        setPropertyForm({
            name: owner?.name || '',
            type: owner?.type || '',
            address: owner?.address || '',
            contacts: (owner?.contacts || []).map((contact) => ({
                type: contact.type === 'Email' ? 'Email' : 'Phone',
                value: contact.value,
                label: contact.label || '',
                // Keep the existing validity flag; a save must not un-flag it.
                isValid: contact.isValid !== false
            }))
        });
        setLeaseExpiryDraft(tower?.parcel?.leaseExpiry ? tower.parcel.leaseExpiry.slice(0, 10) : '');
        setPropertyDialogOpen(true);
    };

    const handleSavePropertyData = async () => {
        if (!tower) return;
        const owner = tower.parcel?.owner;
        if (owner && !propertyForm.name.trim()) {
            alert('Property Owner name is required');
            return;
        }
        setSavingProperty(true);
        try {
            if (owner?.id) {
                await axios.patch(`/api/owners/${owner.id}`, {
                    name: propertyForm.name.trim(),
                    type: propertyForm.type || null,
                    address: propertyForm.address.trim() || null,
                    contacts: propertyForm.contacts
                        .filter((contact) => contact.value.trim())
                        .map((contact) => ({
                            type: contact.type,
                            value: contact.value,
                            label: contact.label || null,
                            isValid: contact.isValid
                        }))
                });
            }
            await axios.patch(`/api/towers/${tower.id}`, {
                parcelUpdate: { leaseExpiry: leaseExpiryDraft || null },
                // Browser-local today, so the server judges past dates against
                // the user's calendar, not the server's timezone.
                clientToday: minLeaseExpiryDate()
            });
            setPropertyDialogOpen(false);
            await refreshKeepingScroll();
        } catch (error: unknown) {
            console.error('Failed to save property data:', error);
            const message = axios.isAxiosError(error)
                ? (error.response?.data as { error?: string } | undefined)?.error
                : undefined;
            alert(message || 'Failed to save property data');
        } finally {
            setSavingProperty(false);
        }
    };

    const updatePropertyContact = (index: number, field: 'type' | 'value' | 'label', value: string) => {
        setPropertyForm((form) => ({
            ...form,
            contacts: form.contacts.map((contact, i) => {
                if (i !== index) return contact;
                if (field === 'type') return { ...contact, type: value as 'Phone' | 'Email' };
                return { ...contact, [field]: value };
            })
        }));
    };

    const handleAddressFieldChange = (field: string, value: string) => {
        setAddressFields(prev => ({ ...prev, [field]: value }));
    };

    const handleClosePropertyDialog = () => {
        if (savingProperty) return;
        setPropertyDialogOpen(false);
        setLeaseExpiryDraft(tower?.parcel?.leaseExpiry ? tower.parcel.leaseExpiry.slice(0, 10) : '');
    };

    const handleOpenSavedStreetView = () => {
        if (streetViewUrl) {
            openExternal(streetViewUrl);
        }
    };

    const navigateTo = (id: number | null) => {
        if (id !== null) {
            router.push(`/towers/${id}`);
        }
    };

    // BC towers get real parcel data from the free ParcelMap BC service.
    useEffect(() => {
        if (!tower) return;
        const rawProvince = tower.parcel?.province;
        const province = typeof rawProvince === 'object' ? rawProvince?.name : rawProvince;
        const label = String(province || tower.parcel?.provinceRaw || tower.parcel?.stateRaw || '').trim();
        if (!/^(british columbia|bc)$/i.test(label)) return;

        let cancelled = false;
        fetch('/api/parcels/bc?lat=' + tower.lat + '&lon=' + tower.lon)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                setBcParcel(data?.parcel ? { status: 'found', parcel: data.parcel } : { status: 'none' });
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('BC parcel lookup failed:', error);
                setBcParcel({ status: 'none' });
            });
        return () => { cancelled = true; };
    }, [tower]);

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
    const cityName = getName(tower.parcel?.city) || tower.parcel?.cityRaw || '';
    const provinceName = getName(tower.parcel?.province) || tower.parcel?.provinceRaw || tower.parcel?.stateRaw || tower.parcel?.state || '';
    const postalCode = tower.parcel?.postalCode || tower.parcel?.zip || '';

    // PublicGIS covers US parcels only, so the control hides for Canadian towers.
    const isUsTower = /^(us|usa|united states)/i.test((tower.parcel?.country ?? '').trim());
    // ParcelMap BC covers British Columbia only.
    const isBcTower = /^(british columbia|bc)$/i.test(provinceName.trim());

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Action Bar */}
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar sx={{ gap: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
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

                    <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }} />

                    {/* One dropdown pair on every screen size */}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                            variant="outlined"
                            color="primary"
                            startIcon={<MapIcon />}
                            endIcon={<ArrowDropDownIcon />}
                            onClick={(e) => setMapMenuAnchor(e.currentTarget)}
                            sx={{
                                bgcolor: 'rgba(25, 118, 210, 0.08)',
                                '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.16)' }
                            }}
                        >
                            Map Views
                        </Button>
                        <Button
                            variant="outlined"
                            color="warning"
                            startIcon={<BusinessIcon />}
                            endIcon={<ArrowDropDownIcon />}
                            onClick={(e) => setOwnerMenuAnchor(e.currentTarget)}
                            sx={{
                                bgcolor: 'rgba(237, 108, 2, 0.08)',
                                '&:hover': { bgcolor: 'rgba(237, 108, 2, 0.16)' }
                            }}
                        >
                            Owners
                        </Button>
                    </Box>

                    <Menu anchorEl={mapMenuAnchor} open={Boolean(mapMenuAnchor)} onClose={() => setMapMenuAnchor(null)}>
                        <MenuItem onClick={() => { setMapMenuAnchor(null); handleViewOnMap(); }}>
                            <ListItemIcon><MapIcon color="primary" /></ListItemIcon>
                            <ListItemText>View on Map</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenGoogleMaps(); }}>
                            <ListItemIcon><OpenInNewIcon sx={{ color: '#4285F4' }} /></ListItemIcon>
                            <ListItemText>Google Maps</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenSatelliteView(); }}>
                            <ListItemIcon><StreetviewIcon color="action" /></ListItemIcon>
                            <ListItemText>Satellite View</ListItemText>
                        </MenuItem>
                        {streetViewUrl && (
                            <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenSavedStreetView(); }}>
                                <ListItemIcon><StreetviewIcon color="success" /></ListItemIcon>
                                <ListItemText>Saved Street View</ListItemText>
                            </MenuItem>
                        )}
                        <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenOnXMaps(); }}>
                            <ListItemIcon><LocationOnIcon sx={{ color: '#5c7c3c' }} /></ListItemIcon>
                            <ListItemText>onX Maps</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenBingMaps(); }}>
                            <ListItemIcon><TravelExploreIcon color="secondary" /></ListItemIcon>
                            <ListItemText>Search Nearby</ListItemText>
                        </MenuItem>
                        {isUsTower && (
                            <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenPublicGis(); }}>
                                <ListItemIcon><LayersIcon color="primary" /></ListItemIcon>
                                <ListItemText>PublicGIS Parcels (US)</ListItemText>
                            </MenuItem>
                        )}
                        {isBcTower && (
                            <MenuItem onClick={() => { setMapMenuAnchor(null); handleOpenParcelMapBc(); }}>
                                <ListItemIcon><LayersIcon color="success" /></ListItemIcon>
                                <ListItemText>ParcelMap BC (Canada)</ListItemText>
                            </MenuItem>
                        )}
                    </Menu>

                    <Menu anchorEl={ownerMenuAnchor} open={Boolean(ownerMenuAnchor)} onClose={() => setOwnerMenuAnchor(null)}>
                        <MenuItem onClick={() => { setOwnerMenuAnchor(null); handleLookupOwner(); }} disabled={isOwnerLoading}>
                            <ListItemIcon><BusinessIcon color="primary" /></ListItemIcon>
                            <ListItemText>{isOwnerLoading ? 'Loading...' : 'Lookup Property Owner'}</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => { setOwnerMenuAnchor(null); setAddOwnerOpen(true); }}>
                            <ListItemIcon><PersonAddIcon color="warning" /></ListItemIcon>
                            <ListItemText>Add Property Owner</ListItemText>
                        </MenuItem>
                    </Menu>

                </Toolbar>
            </AppBar>

            {/* Content */}
            <Box ref={contentRef} sx={{ flex: 1, overflow: 'auto', overflowAnchor: 'none', p: 3, backgroundColor: '#f5f5f5' }}>
                <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
                    {/* Quick Info Card */}
                    <Paper sx={{ p: 3, mb: 3, bgcolor: '#f8f9fa', border: '2px solid #e0e0e0' }}>
                        <Box
                            sx={{
                                display: 'flex',
                                flexDirection: { xs: 'column', sm: 'row' },
                                alignItems: { xs: 'flex-start', sm: 'center' },
                                justifyContent: 'space-between',
                                gap: 1,
                                mb: 2
                            }}
                        >
                            <Typography variant="h5" sx={{ fontWeight: 600 }}>
                                Tower Information
                            </Typography>
                            <Box>
                                {status && (
                                    <Chip
                                        label={status}
                                        size="medium"
                                        color="primary"
                                        sx={{
                                            fontSize: { xs: '0.875rem', sm: '1rem' },
                                            fontWeight: 600,
                                            maxWidth: '100%',
                                            height: 'auto',
                                            '& .MuiChip-label': { py: 0.5, whiteSpace: 'normal' }
                                        }}
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

                        {/* Parcel data for BC towers */}
                        {isBcTower && (
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Parcel (BC ParcelMap)
                                </Typography>
                                {bcParcel.status === 'found' && bcParcel.parcel ? (
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.5 }}>
                                        {bcParcel.parcel.ownerType && (
                                            <Chip
                                                label={bcParcel.parcel.ownerType}
                                                size="small"
                                                color={/private/i.test(bcParcel.parcel.ownerType) ? 'default' : 'success'}
                                            />
                                        )}
                                        {bcParcel.parcel.pid && (
                                            <Chip label={'PID ' + bcParcel.parcel.pid} size="small" variant="outlined" />
                                        )}
                                        {bcParcel.parcel.municipality && (
                                            <Typography variant="body2" color="text.secondary">
                                                {bcParcel.parcel.municipality}
                                            </Typography>
                                        )}
                                        {typeof bcParcel.parcel.areaSqm === 'number' && (
                                            <Typography variant="body2" color="text.secondary">
                                                {(bcParcel.parcel.areaSqm / 10000).toFixed(2)} ha
                                            </Typography>
                                        )}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                        {bcParcel.status === 'idle' ? 'Loading parcel…' : 'No parcel found at this point.'}
                                    </Typography>
                                )}
                            </Box>
                        )}

                        {/* Key Details Grid - Dropdowns for Type/Carrier */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
                            {/* Type Dropdown */}
                            <FormControl fullWidth size="small">
                                <InputLabel>Type</InputLabel>
                                <Select
                                    value={selectedTypeId}
                                    label="Type"
                                    open={typeMenuOpen}
                                    onOpen={() => setTypeMenuOpen(true)}
                                    onClose={() => setTypeMenuOpen(false)}
                                    renderValue={(val) => types.find(t => t.id === val)?.name || ''}
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
                                    {renderLookupMenuItems('type', types)}
                                    <Divider />
                                    <MenuItem value={ADD_NEW_VALUE}>
                                        <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add New Type
                                    </MenuItem>
                                </Select>
                            </FormControl>



                            {/* Carrier Dropdown */}
                            <FormControl fullWidth size="small">
                                <InputLabel>Carrier</InputLabel>
                                <Select
                                    value={selectedCarrierId}
                                    label="Carrier"
                                    open={carrierMenuOpen}
                                    onOpen={() => setCarrierMenuOpen(true)}
                                    onClose={() => setCarrierMenuOpen(false)}
                                    renderValue={(val) => carriers.find(c => c.id === val)?.name || ''}
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
                                    {renderLookupMenuItems('carrier', carriers)}
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
                                value={String(selectedStatusId)}
                                label="Status"
                                open={statusMenuOpen}
                                onOpen={() => setStatusMenuOpen(true)}
                                onClose={() => setStatusMenuOpen(false)}
                                renderValue={(val) => statuses.find(s => String(s.id) === val)?.name || ''}
                                onChange={handleStatusChange}
                                disabled={saving}
                            >
                                {renderLookupMenuItems('status', statuses)}
                                <Divider />
                                <MenuItem value={ADD_NEW_VALUE}>
                                    <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add New Status
                                </MenuItem>
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

                    {/* Parcel & Owner Section */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Box>
                                <Typography variant="h6">
                                    <PersonIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                                    Parcel & Property Owner Information
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Data source: {tower.parcel?.dataSource || tower.source || 'N/A'}
                                </Typography>
                            </Box>
                            {tower.parcel && !editingAddress && (
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button
                                        startIcon={isNormalizing ? <CircularProgress size={16} /> : <TravelExploreIcon />}
                                        size="small"
                                        onClick={handleNormalize}
                                        disabled={isNormalizing}
                                        color="secondary"
                                    >
                                        Normalize
                                    </Button>
                                    <Button
                                        startIcon={<EditIcon />}
                                        size="small"
                                        onClick={() => setEditingAddress(true)}
                                    >
                                        Edit Address
                                    </Button>
                                </Box>
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
                                                    county: (tower.parcel.countyNormalized as any)?.name || tower.parcel.countyRaw || '',
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
                        {tower.parcel ? (
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
                                    <Box sx={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Address</Typography>
                                    </Box>
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
                                    {tower.parcel?.unit && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Unit</Typography>
                                            <Typography variant="body1">{tower.parcel.unit}</Typography>
                                        </Box>
                                    )}
                                    {tower.parcel?.country && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Country</Typography>
                                            <Typography variant="body1">{tower.parcel.country}</Typography>
                                        </Box>
                                    )}
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Postal Code</Typography>
                                        <Typography variant="body1">{postalCode || 'N/A'}</Typography>
                                    </Box>
                                    {(tower.parcel?.county || tower.parcel?.countyRaw) && (
                                        <Box sx={{ mb: 2 }}>
                                            <Typography variant="subtitle2" color="text.secondary">County</Typography>
                                            <Typography variant="body1">{(tower.parcel.county as any)?.name || tower.parcel.countyRaw}</Typography>
                                        </Box>
                                    )}

                                    <Box sx={{ gridColumn: '1 / -1' }}>
                                        <Divider sx={{ my: 1 }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Property</Typography>
                                            <Button
                                                size="small"
                                                startIcon={<EditIcon />}
                                                onClick={openPropertyDialog}
                                            >
                                                Update Property Data
                                            </Button>
                                        </Box>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Parcel ID / PIN</Typography>
                                        <Typography variant="body1">{tower.parcel?.parcelId || 'N/A'}</Typography>
                                    </Box>
                                    {tower.parcel?.rawData && (tower.parcel.rawData as any).parcelDesignator && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Designator</Typography>
                                            <Typography variant="body1">{(tower.parcel.rawData as any).parcelDesignator}</Typography>
                                        </Box>
                                    )}
                                    <Box>
                                        <Typography variant="body2" color="text.secondary">Lease Expiry</Typography>
                                        {tower.parcel?.leaseExpiry ? (
                                            <LeaseExpiryCell value={tower.parcel.leaseExpiry} />
                                        ) : (
                                            <Typography variant="body1">N/A</Typography>
                                        )}
                                        {tower.leaseExpiryHistory && tower.leaseExpiryHistory.length > 0 && (
                                            <Box sx={{ mt: 0.5 }}>
                                                {tower.leaseExpiryHistory.map((entry) => (
                                                    <Typography key={entry.id} variant="caption" color="text.secondary" display="block">
                                                        {entry.newValue
                                                            ? (entry.oldValue
                                                                ? `${formatLeaseExpiry(entry.oldValue)} to ${formatLeaseExpiry(entry.newValue)}`
                                                                : `Set to ${formatLeaseExpiry(entry.newValue)}`)
                                                            : `Cleared (was ${formatLeaseExpiry(entry.oldValue)})`}
                                                        {` · ${entry.userName || 'Unknown'} · ${new Date(entry.createdAt).toLocaleDateString()}`}
                                                    </Typography>
                                                ))}
                                            </Box>
                                        )}
                                    </Box>
                                    {tower.parcel?.owner && (
                                        <>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">Property Owner Name</Typography>
                                                <Typography variant="body1">
                                                    {tower.parcel.owner.id ? (
                                                        <Button
                                                            size="small"
                                                            sx={{ p: 0, minWidth: 'auto', textTransform: 'none', fontWeight: 'normal', fontSize: '1rem', color: 'primary.main', textAlign: 'left', display: 'flex', alignItems: 'center' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/owners/${tower.parcel!.owner!.id}`);
                                                            }}
                                                            endIcon={<OpenInNewIcon fontSize="small" />}
                                                        >
                                                            {tower.parcel.owner.name || 'N/A'}
                                                        </Button>
                                                    ) : (
                                                        tower.parcel.owner.name || 'N/A'
                                                    )}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary">Property Owner Type</Typography>
                                                <Typography variant="body1">{tower.parcel.owner.type || 'N/A'}</Typography>
                                            </Box>
                                            <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                                                <Typography variant="body2" color="text.secondary">Property Owner Address</Typography>
                                                <Typography variant="body1">{tower.parcel.owner.address || 'N/A'}</Typography>
                                            </Box>
                                            {tower.parcel.owner.contacts && tower.parcel.owner.contacts.length > 0 && (
                                                <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                                                    <Typography variant="body2" color="text.secondary">Contacts</Typography>
                                                    <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                        {tower.parcel.owner.contacts.map((contact) => (
                                                            <Box key={contact.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Chip size="small" label={contact.type} sx={{ borderRadius: 1 }} />
                                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                                    {contact.value}
                                                                </Typography>
                                                                {contact.label && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        ({contact.label})
                                                                    </Typography>
                                                                )}
                                                                {!contact.isValid && (
                                                                    <Chip size="small" color="error" label="Invalid" sx={{ ml: 1, height: 20, fontSize: '0.65rem' }} />
                                                                )}
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                </Box>
                                            )}
                                        </>
                                    )}
                                    {(tower.parcel?.ihunterCloseupUrl || tower.parcel?.ihunterOverlayUrl) && (
                                        <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                                            <Divider sx={{ my: 1 }} />
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                iHunter Landowner Map
                                                {tower.parcel?.ihunterScrapedAt && (
                                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                        (captured {new Date(tower.parcel.ihunterScrapedAt).toLocaleDateString()})
                                                    </Typography>
                                                )}
                                            </Typography>
                                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                                                {tower.parcel?.ihunterCloseupUrl && (
                                                    <Box>
                                                        <Typography variant="caption" color="text.secondary">Close-up (owner)</Typography>
                                                        <a href={tower.parcel.ihunterCloseupUrl} target="_blank" rel="noopener noreferrer">
                                                            <Box
                                                                component="img"
                                                                src={tower.parcel.ihunterCloseupUrl}
                                                                alt="iHunter close-up of parcel owner"
                                                                sx={{ width: '100%', borderRadius: 1, border: '1px solid #e0e0e0', display: 'block', mt: 0.5 }}
                                                            />
                                                        </a>
                                                    </Box>
                                                )}
                                                {tower.parcel?.ihunterOverlayUrl && (
                                                    <Box>
                                                        <Typography variant="caption" color="text.secondary">Surrounding owners (overlay)</Typography>
                                                        <a href={tower.parcel.ihunterOverlayUrl} target="_blank" rel="noopener noreferrer">
                                                            <Box
                                                                component="img"
                                                                src={tower.parcel.ihunterOverlayUrl}
                                                                alt="iHunter overlay of surrounding owners"
                                                                sx={{ width: '100%', borderRadius: 1, border: '1px solid #e0e0e0', display: 'block', mt: 0.5 }}
                                                            />
                                                        </a>
                                                    </Box>
                                                )}
                                            </Box>
                                        </Box>
                                    )}
                                    <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                                        <Divider sx={{ my: 1 }} />
                                        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                                            <PhoneIcon color="primary" />
                                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                Tower Phones
                                            </Typography>
                                        </Stack>
                                        {tower.phones && tower.phones.length > 0 ? (
                                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                                                {tower.phones.map((phone) => (
                                                    <Paper key={phone.id} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#fafafa' }}>
                                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                                                            {phone.number.length === 10
                                                                ? `(${phone.number.slice(0, 3)}) ${phone.number.slice(3, 6)}-${phone.number.slice(6)}`
                                                                : phone.number}
                                                        </Typography>
                                                        <Chip
                                                            label={phone.status}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: '0.65rem',
                                                                borderColor: phone.status === 'active' || phone.status === 'verified_active'
                                                                    ? 'success.main'
                                                                    : phone.status === 'inactive'
                                                                        ? 'error.main'
                                                                        : 'grey.400',
                                                                color: phone.status === 'active' || phone.status === 'verified_active'
                                                                    ? 'success.main'
                                                                    : phone.status === 'inactive'
                                                                        ? 'error.main'
                                                                        : 'text.secondary'
                                                            }}
                                                        />
                                                    </Paper>
                                                ))}
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                                No tower phone numbers found.
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            )
                        ) : (
                            <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                No parcel data. Use &quot;Lookup Property Owner&quot; to fetch parcel information.
                            </Typography>
                        )}
                    </Paper>

                    {/* Notes Section */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <NotesPanel
                            towerId={tower.id}
                            notes={notes}
                            onNotesChange={handleNotesChange}
                        />
                    </Paper>

                    {/* Documents Section */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <TowerDocuments key={tower.id} towerId={tower.id} />
                    </Paper>

                    {/* Nearby Businesses Section */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <BusinessIcon sx={{ mr: 1, color: 'primary.main' }} />
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Nearby Businesses (within 2000m)
                            </Typography>
                        </Box>
                        <Divider sx={{ mb: 2 }} />

                        {tower.businessesNearby && tower.businessesNearby.length > 0 && (
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    mb: 2,
                                    borderColor: nearestCallableBiz ? 'success.main' : 'warning.main',
                                    bgcolor: nearestCallableBiz ? '#f1f8f4' : '#fdf8ef',
                                }}
                            >
                                {nearestCallableBiz ? (
                                    <Stack
                                        direction={{ xs: 'column', sm: 'row' }}
                                        spacing={1.5}
                                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                                    >
                                        <PhoneIcon color="success" />
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                Nearest business you can call
                                            </Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                {nearestCallableBiz.name}
                                                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                                                    {Math.round(nearestCallableBiz.distance)}m away
                                                </Typography>
                                            </Typography>
                                            {closerWithoutPhone > 0 && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                    {closerWithoutPhone} closer {closerWithoutPhone === 1 ? 'business has' : 'businesses have'} no phone listed
                                                </Typography>
                                            )}
                                        </Box>
                                        <Button
                                            variant="contained"
                                            color="success"
                                            href={`tel:${nearestCallableBiz.phone!.replace(/[^\d+]/g, '')}`}
                                            startIcon={<PhoneIcon />}
                                            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                                        >
                                            {nearestCallableBiz.phone}
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <PhoneIcon color="warning" />
                                        <Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                No business with a phone nearby
                                            </Typography>
                                            <Typography variant="body2">
                                                {tower.businessesNearby.length} located within 2000m, none list a phone number.
                                            </Typography>
                                        </Box>
                                    </Stack>
                                )}
                            </Paper>
                        )}

                        {tower.businessesNearby && tower.businessesNearby.length > 0 && bizTiers.length > 1 && (
                            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                                    Show within
                                </Typography>
                                {bizTiers.map(({ radius, count }) => {
                                    const selected = bizRadius === radius;
                                    return (
                                        <Chip
                                            key={radius}
                                            label={`${radius}m · ${count}`}
                                            size="small"
                                            onClick={() => { setBizRadiusPick(radius); setBizPage(0); }}
                                            color={selected ? 'primary' : 'default'}
                                            variant={selected ? 'filled' : 'outlined'}
                                            sx={{ textTransform: 'none' }}
                                        />
                                    );
                                })}
                            </Stack>
                        )}

                        {!tower.businessesNearby || tower.businessesNearby.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                No nearby businesses found or batch has not run yet.
                            </Typography>
                        ) : (
                            <>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                                {bizPageItems.map((biz) => {
                                    const addr = bizAddress(biz);
                                    const hasCoords = !!bizCoords(biz);
                                    const isSelected = selectedBizId === biz.id;
                                    return (
                                    <Paper
                                        key={biz.id}
                                        variant="outlined"
                                        sx={{
                                            p: 2,
                                            bgcolor: isSelected ? 'primary.50' : '#fafafa',
                                            borderColor: isSelected ? 'primary.main' : undefined,
                                            display: 'flex',
                                            flexDirection: 'column',
                                        }}
                                    >
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.dark' }}>
                                            {biz.name}
                                        </Typography>
                                        {addr && (
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                {addr}
                                            </Typography>
                                        )}
                                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                                            Distance: <strong>{Math.round(biz.distance)}m</strong>
                                        </Typography>
                                        {biz.phone && (
                                            <Typography variant="body2" color="success.main" sx={{ fontWeight: 500, mt: 0.5 }}>
                                                📞 {biz.phone}
                                            </Typography>
                                        )}
                                        {hasCoords && (
                                            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<StreetviewIcon />}
                                                    onClick={() => handleBizSatellite(biz)}
                                                    sx={{ textTransform: 'none' }}
                                                >
                                                    Satellite
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant={isSelected ? 'contained' : 'outlined'}
                                                    startIcon={<MapIcon />}
                                                    onClick={() => handleSelectBizOnMap(biz)}
                                                    sx={{ textTransform: 'none' }}
                                                >
                                                    Show on map
                                                </Button>
                                            </Stack>
                                        )}
                                    </Paper>
                                    );
                                })}
                            </Box>
                            {bizTotalPages > 1 && (
                                <Stack
                                    direction="row"
                                    spacing={2}
                                    alignItems="center"
                                    justifyContent="center"
                                    sx={{ mt: 2 }}
                                >
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<NavigateBeforeIcon />}
                                        disabled={bizPage === 0}
                                        onClick={() => setBizPage((p) => Math.max(0, p - 1))}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        Previous
                                    </Button>
                                    <Typography variant="body2" color="text.secondary">
                                        Page {bizPage + 1} of {bizTotalPages} &middot;{' '}
                                        {bizWithinRadius.length} within {bizRadius}m
                                    </Typography>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        endIcon={<NavigateNextIcon />}
                                        disabled={bizPage >= bizTotalPages - 1}
                                        onClick={() => setBizPage((p) => Math.min(bizTotalPages - 1, p + 1))}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        Next
                                    </Button>
                                </Stack>
                            )}
                            </>
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
                        <Box id="tower-location-map" sx={{ height: 560, position: 'relative' }}>
                            {mounted ? (
                                <>
                                    <Map
                                        center={mapCenter ?? [tower.lat, tower.lon]}
                                        zoom={selectedBizId ? 17 : 13}
                                        towers={[tower]}
                                        businessesNearby={tower.businessesNearby || []}
                                        onTowerSelect={(selected) => {
                                            const action = 'action' in selected ? selected.action : undefined;
                                            if (action === 'addOwner') {
                                                setAddOwnerOpen(true);
                                                return;
                                            }
                                            setMapSelectedTower(selected as Tower);
                                        }}
                                        onTowerDeselect={() => setMapSelectedTower(null)}
                                        selectedTower={mapSelectedTower}
                                        selectedBusinessId={selectedBizId}
                                        onBusinessSelect={setSelectedBizId}
                                        mapStyle={mapStyle}
                                        mapModes={mapModes}
                                    />
                                    <MapDetailsPanel
                                        mapStyle={mapStyle}
                                        onMapStyleChange={setMapStyle}
                                        mapModes={mapModes}
                                        onMapModesChange={setMapModes}
                                    />
                                </>
                            ) : (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <CircularProgress />
                                </Box>
                            )}
                        </Box>
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
                    Change Status to &quot;{statuses.find(s => s.id === pendingStatusId)?.name || 'Unknown'}&quot;
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
                        placeholder="e.g., Spoke with property owner, they are interested..."
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
                        disabled={saving}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save With Note'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Update Property Data Dialog */}
            <Dialog open={propertyDialogOpen} onClose={handleClosePropertyDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Update Property Data{tower ? ` for Tower #${tower.id}` : ''}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField
                            label="Property Owner Name"
                            value={propertyForm.name}
                            onChange={(e) => setPropertyForm((form) => ({ ...form, name: e.target.value }))}
                            required
                            fullWidth
                            autoFocus
                            disabled={!tower?.parcel?.owner}
                        />

                        <FormControl fullWidth disabled={!tower?.parcel?.owner}>
                            <InputLabel>Property Owner Type</InputLabel>
                            <Select
                                value={propertyForm.type}
                                label="Property Owner Type"
                                onChange={(e) => setPropertyForm((form) => ({ ...form, type: e.target.value }))}
                            >
                                <MenuItem value="">None</MenuItem>
                                <MenuItem value="Individual">Individual</MenuItem>
                                <MenuItem value="LLC">LLC</MenuItem>
                                <MenuItem value="Trust">Trust</MenuItem>
                                <MenuItem value="Corp">Corporation</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField
                            label="Mailing Address"
                            value={propertyForm.address}
                            onChange={(e) => setPropertyForm((form) => ({ ...form, address: e.target.value }))}
                            fullWidth
                            multiline
                            rows={2}
                            disabled={!tower?.parcel?.owner}
                        />

                        <TextField
                            label="Lease Expiry"
                            type="date"
                            value={leaseExpiryDraft}
                            onChange={(e) => setLeaseExpiryDraft(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ min: minLeaseExpiryDate() }}
                            helperText="Date cannot be in the past"
                            fullWidth
                        />

                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="subtitle2">Contacts</Typography>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={!tower?.parcel?.owner}
                                    onClick={() => setPropertyForm((form) => ({
                                        ...form,
                                        contacts: [...form.contacts, { type: 'Phone', value: '', label: '', isValid: true }]
                                    }))}
                                >
                                    Add Contact
                                </Button>
                            </Box>
                            <Stack spacing={1}>
                                {propertyForm.contacts.map((contact, index) => (
                                    <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                        <FormControl size="small" sx={{ minWidth: 100 }}>
                                            <Select
                                                value={contact.type}
                                                onChange={(e) => updatePropertyContact(index, 'type', e.target.value)}
                                            >
                                                <MenuItem value="Phone">Phone</MenuItem>
                                                <MenuItem value="Email">Email</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <TextField
                                            size="small"
                                            placeholder={contact.type === 'Phone' ? 'Phone number' : 'Email address'}
                                            value={contact.value}
                                            onChange={(e) => updatePropertyContact(index, 'value', e.target.value)}
                                            sx={{ flex: 1 }}
                                        />
                                        <TextField
                                            size="small"
                                            placeholder="Label"
                                            value={contact.label}
                                            onChange={(e) => updatePropertyContact(index, 'label', e.target.value)}
                                            sx={{ width: 100 }}
                                        />
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => setPropertyForm((form) => ({
                                                ...form,
                                                contacts: form.contacts.filter((_, i) => i !== index)
                                            }))}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                ))}
                            </Stack>
                            {!tower?.parcel?.owner && (
                                <Typography variant="body2" color="text.secondary">
                                    No property owner linked. Use Add Property Owner to create one.
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClosePropertyDialog} disabled={savingProperty}>
                        Cancel
                    </Button>
                    <Button onClick={handleSavePropertyData} variant="contained" disabled={savingProperty}>
                        {savingProperty ? 'Saving...' : 'Save Property Data'}
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
                    Add New {addDialogType === 'type' ? 'Tower Type' : addDialogType === 'carrier' ? 'Carrier' : 'Status'}
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

            {/* Rename Lookup Dialog */}
            <Dialog
                open={editLookupDialog.open}
                onClose={() => !lookupActionSaving && setEditLookupDialog(d => ({ ...d, open: false }))}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    Rename {editLookupDialog.type === 'type' ? 'Tower Type' : editLookupDialog.type === 'carrier' ? 'Carrier' : 'Status'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        label="Name"
                        fullWidth
                        value={editLookupValue}
                        onChange={(e) => setEditLookupValue(e.target.value)}
                        sx={{ mt: 1 }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && editLookupValue.trim()) {
                                handleEditLookupSave();
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditLookupDialog(d => ({ ...d, open: false }))} disabled={lookupActionSaving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleEditLookupSave}
                        variant="contained"
                        disabled={lookupActionSaving || !editLookupValue.trim()}
                    >
                        {lookupActionSaving ? <CircularProgress size={20} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
