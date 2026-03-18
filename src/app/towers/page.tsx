'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense, useCallback } from 'react';
import Box from '@mui/material/Box';
import axios from 'axios';
import Link from 'next/link';
import { Paper, Typography, Drawer, IconButton, Button, Chip, Stack } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import CloseIcon from '@mui/icons-material/Close';
import TowerTableSimple from '@/components/TowerTableSimple';
import NotesPanel from '@/components/NotesPanel';
import AddOwnerDialog from '@/components/AddOwnerDialog';
import { useCountry } from '@/lib/country-context';

interface Tower {
    id: number;
    type: string;
    subType?: string;
    lat: number;
    lon: number;
    details?: any;
    parcel?: any;
    status?: string;
    source?: string;
    // Flattened fields for DataGrid
    address?: string;
    city?: string;
    county?: string;
    state?: string;
    zip?: string;
    parcelId?: string;
    ownerName?: string;
    dataSource?: string;
    businessCount?: number;
    avgBusinessDistance?: number;
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

function TowersPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { country: globalCountry } = useCountry();

    const [towers, setTowers] = useState<Tower[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [page, setPage] = useState<number>(0);
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
    const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
    const [notesDrawerTower, setNotesDrawerTower] = useState<any>(null);
    const [addOwnerTower, setAddOwnerTower] = useState<any>(null);
    const [notesDrawerNotes, setNotesDrawerNotes] = useState<any[]>([]);
    const [filterOptions, setFilterOptions] = useState<{
        cities: string[];
        states: string[];
        counties: string[];
        zips: string[];
        types: string[];
        carriers: string[];
        statuses: string[];
    }>({ cities: [], states: [], counties: [], zips: [], types: [], carriers: [], statuses: [] });
    const [lookups, setLookups] = useState<{
        types: { id: number; name: string }[];
        carriers: { id: number; name: string }[];
        statuses: { id: number; name: string }[];
    }>({ types: [], carriers: [], statuses: [] });
    // Initialize filters from URL ?id= param immediately so the first loadTowers already has it
    const urlIdParam = searchParams.get('id');
    const [filters, setFilters] = useState<{
        city?: string;
        state?: string;
        county?: string;
        zip?: string;
        type?: string;
        status?: string;
        address?: string;
        id?: string;
        search?: string;
        minBusinessCount?: string;
        maxBusinessCount?: string;
        minAvgDistance?: string;
        maxAvgDistance?: string;
    }>(() => urlIdParam ? { id: urlIdParam } : {});

    // Load settings from local storage on mount (skip if URL has ?id= param)
    useEffect(() => {
        if (urlIdParam) return; // URL id param takes priority over saved settings

        const savedSettings = localStorage.getItem('towersPageSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.page !== undefined) setPage(parsed.page);
                if (parsed.rowsPerPage) setRowsPerPage(parsed.rowsPerPage);
                if (parsed.filters) setFilters(parsed.filters);
            } catch (e) {
                console.error("Failed to parse saved settings", e);
            }
        }
    }, []);

    // Save settings when changed
    useEffect(() => {
        const settings = {
            page,
            rowsPerPage,
            filters
        };
        localStorage.setItem('towersPageSettings', JSON.stringify(settings));
    }, [page, rowsPerPage, filters]);

    // Load distinct filter values (re-fetch when global country changes)
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const countryParam = globalCountry ? `&country=${encodeURIComponent(globalCountry)}` : '';
                const [filtersRes, lookupsRes] = await Promise.all([
                    axios.get(`/api/towers?distinct=filters${countryParam}`),
                    axios.get('/api/towers?distinct=lookups')
                ]);
                const typesData = lookupsRes.data.types || [];
                const carriersData = lookupsRes.data.carriers || [];
                const statusesData = lookupsRes.data.statuses || [];
                setLookups({ types: typesData, carriers: carriersData, statuses: statusesData });
                setFilterOptions(prev => ({
                    ...prev,
                    cities: filtersRes.data.cities || [],
                    states: filtersRes.data.states || [],
                    counties: filtersRes.data.counties || [],
                    zips: filtersRes.data.zips || [],
                    types: typesData.map((t: any) => t.name),
                    carriers: carriersData.map((c: any) => c.name),
                    statuses: statusesData.map((s: any) => s.name),
                }));
            } catch (error) {
                console.error("Failed to fetch filter options:", error);
            }
        };
        loadFilterOptions();
    }, [globalCountry]);

    // Load towers function
    const loadTowers = useCallback(async () => {
        setIsLoading(true);
        try {
            // Build query string with filters
            const params = new URLSearchParams({
                page: page.toString(),
                limit: rowsPerPage.toString()
            });

            if (globalCountry) params.append('country', globalCountry);
            if (filters.id) params.append('id', filters.id);
            if (!filters.id) {
                // Only apply other filters when not filtering by ID
                if (filters.city) params.append('city', filters.city);
                if (filters.county) params.append('county', filters.county);
                if (filters.state) params.append('state', filters.state);
                if (filters.zip) params.append('zip', filters.zip);
                if (filters.type) params.append('type', filters.type);
                if (filters.status) params.append('status', filters.status);
                if (filters.address) params.append('address', filters.address);
                if (filters.search) params.append('search', filters.search);
                if (filters.minBusinessCount) params.append('minBusinessCount', filters.minBusinessCount);
                if (filters.maxBusinessCount) params.append('maxBusinessCount', filters.maxBusinessCount);
                if (filters.minAvgDistance) params.append('minAvgDistance', filters.minAvgDistance);
                if (filters.maxAvgDistance) params.append('maxAvgDistance', filters.maxAvgDistance);
            }

            const res = await axios.get(`/api/towers?${params.toString()}`);

            // API returns plain array when filtering by id, paginated object otherwise
            const rawData = Array.isArray(res.data) ? res.data : (res.data.data || []);
            const flattenedTowers = rawData.map((tower: any) => ({
                ...tower,
                type: typeof tower.type === 'object' ? tower.type?.name : (tower.type || ''),
                status: typeof tower.status === 'object' ? tower.status?.name : (tower.legacyStatus || ''),
                carrier: typeof tower.carrier === 'object' ? tower.carrier?.name : (tower.carrier || ''),
                address: tower.parcel?.address || '',
                city: typeof tower.parcel?.city === 'object' ? tower.parcel?.city?.name : (tower.parcel?.cityRaw || ''),
                county: tower.parcel?.county || '',
                state: typeof tower.parcel?.province === 'object' ? tower.parcel?.province?.name : (tower.parcel?.provinceRaw || tower.parcel?.stateRaw || ''),
                zip: tower.parcel?.postalCode || tower.parcel?.zip || '',
                parcelId: tower.parcel?.parcelId || '',
                ownerName: tower.parcel?.owner?.name || '',
                dataSource: tower.parcel?.dataSource || ''
            }));

            setTowers(flattenedTowers);
            setTotalCount(Array.isArray(res.data) ? flattenedTowers.length : (res.data.total || 0));
        } catch (error) {
            console.error("Failed to fetch towers:", error);
        } finally {
            setIsLoading(false);
        }
    }, [page, rowsPerPage, filters, globalCountry]);

    // Load towers with pagination and filters
    useEffect(() => {
        loadTowers();
    }, [loadTowers]);

    const handleLookupOwner = async (tower: Tower) => {
        setIsOwnerLoading(true);
        try {
            const res = await axios.get(`/api/owner?lat=${tower.lat}&lon=${tower.lon}`);

            if (res.data.result?._parcel) {
                const parcelData = res.data.result._parcel;

                // Extract owner name, making sure it's not a parcel ID or generic value
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

                // Update both nested and flattened fields
                const updatedTower = {
                    ...tower,
                    parcel: parcelData,
                    // Update flattened fields for DataGrid
                    address: parcelData.address || tower.address || '',
                    city: typeof parcelData.city === 'object' ? parcelData.city?.name : (parcelData.cityRaw || tower.city || ''),
                    county: parcelData.county || tower.county || '',
                    state: typeof parcelData.province === 'object' ? parcelData.province?.name : (parcelData.provinceRaw || parcelData.stateRaw || tower.state || ''),
                    zip: parcelData.postalCode || parcelData.zip || tower.zip || '',
                    parcelId: parcelData.parcelId || tower.parcelId || '',
                    ownerName: ownerName || '',
                    dataSource: parcelData.dataSource || tower.dataSource || ''
                };

                setTowers(prevTowers => prevTowers.map(t => t.id === tower.id ? updatedTower : t));

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

    const handleViewOnMap = (tower: Tower) => {
        // Navigate to map page with tower selected
        router.push(`/?selectTower=${tower.id}`);
    };

    const handleViewDetails = (tower: Tower) => {
        router.push(`/towers/${tower.id}`);
    };

    const handleNotesClick = async (tower: any) => {
        setNotesDrawerTower(tower);
        try {
            const res = await axios.get(`/api/towers/${tower.id}/notes`);
            setNotesDrawerNotes(res.data);
        } catch (error) {
            console.error('Failed to load notes:', error);
            setNotesDrawerNotes([]);
        }
    };

    const handleNotesDrawerChange = async () => {
        if (!notesDrawerTower) return;
        try {
            const res = await axios.get(`/api/towers/${notesDrawerTower.id}/notes`);
            setNotesDrawerNotes(res.data);
            loadTowers(); // Refresh table to update note counts
        } catch (error) {
            console.error('Failed to reload notes:', error);
        }
    };

    const handleCellEdit = async (towerId: number, field: string, value: string) => {
        try {
            let patchData: any = {};

            if (field === 'status') {
                if (!value) {
                    patchData.statusId = null;
                } else {
                    const found = lookups.statuses.find(s => s.name === value);
                    if (found) patchData.statusId = found.id;
                }
            } else if (field === 'type') {
                if (!value) {
                    patchData.typeId = null;
                } else {
                    const found = lookups.types.find(t => t.name === value);
                    if (found) patchData.typeId = found.id;
                }
            } else if (field === 'carrier') {
                if (!value) {
                    patchData.carrierId = null;
                } else {
                    const found = lookups.carriers.find(c => c.name === value);
                    if (found) patchData.carrierId = found.id;
                }
            }

            if ('statusId' in patchData || 'typeId' in patchData || 'carrierId' in patchData) {
                await axios.patch(`/api/towers/${towerId}`, patchData);
                // Also update local state so the table doesn't revert if filters/pages change without a full reload
                setTowers(prevTowers => prevTowers.map(t => {
                    if (t.id === towerId) {
                        return { ...t, [field]: value || '' };
                    }
                    return t;
                }));
            }
        } catch (error) {
            console.error('Error updating tower:', error);
            loadTowers(); // Reload to revert on error
        }
    };


    return (
        <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Button
                            component={Link}
                            href="/"
                            variant="outlined"
                            size="small"
                            startIcon={<MapIcon />}
                            sx={{ textTransform: 'none' }}
                        >
                            Back to Map
                        </Button>
                        <Typography variant="h5" sx={{ fontWeight: 600 }}>Towers List</Typography>
                        {filters.id && (
                            <Chip
                                label={`Tower ID: ${filters.id}`}
                                color="primary"
                                size="small"
                                onDelete={() => {
                                    setFilters({});
                                    setPage(0);
                                    router.replace('/towers');
                                }}
                            />
                        )}
                    </Box>
                    {isLoading && <Typography variant="body2" color="text.secondary">Loading...</Typography>}
                </Box>
                <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <TowerTableSimple
                        towers={towers}
                        totalCount={totalCount}
                        page={page}
                        rowsPerPage={rowsPerPage}
                        onPageChange={setPage}
                        onRowsPerPageChange={setRowsPerPage}
                        onViewOnMap={handleViewOnMap}
                        onGetOwner={handleLookupOwner}
                        onViewDetails={handleViewDetails}
                        isOwnerLoading={isOwnerLoading}
                        isLoading={isLoading}
                        filterOptions={filterOptions}
                        lookups={lookups}
                        filters={filters}
                        onFilterChange={(newFilters) => {
                            setFilters(newFilters);
                            setPage(0);
                        }}
                        onCellEdit={handleCellEdit}
                        onNotesClick={handleNotesClick}
                        onAddOwner={(tower) => setAddOwnerTower(tower)}
                        country={globalCountry}
                    />
                </Paper>
            </Box>

            {/* Notes Drawer */}
            <Drawer
                anchor="right"
                open={!!notesDrawerTower}
                onClose={() => setNotesDrawerTower(null)}
                sx={{
                    '& .MuiDrawer-paper': {
                        width: { xs: '100%', sm: 450 },
                        p: 0
                    }
                }}
            >
                {notesDrawerTower && (
                    <>
                        <Box sx={{
                            p: 2,
                            bgcolor: 'primary.main',
                            color: 'white',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <Typography variant="h6">
                                Tower #{notesDrawerTower.id} - Notes
                            </Typography>
                            <IconButton onClick={() => setNotesDrawerTower(null)} sx={{ color: 'white' }}>
                                <CloseIcon />
                            </IconButton>
                        </Box>
                        <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
                            <NotesPanel
                                towerId={notesDrawerTower.id}
                                notes={notesDrawerNotes}
                                onNotesChange={handleNotesDrawerChange}
                            />
                        </Box>
                    </>
                )}
            </Drawer>

            {/* Add Owner Dialog */}
            <AddOwnerDialog
                open={!!addOwnerTower}
                onClose={() => setAddOwnerTower(null)}
                onSuccess={() => loadTowers()}
                towerId={addOwnerTower?.id}
            />
        </Box>
    );
}

export default function TowersPage() {
    return (
        <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</Box>}>
            <TowersPageContent />
        </Suspense>
    );
}
