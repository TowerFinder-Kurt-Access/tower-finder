'use client';
import { useState, useEffect, useCallback, Suspense, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
    Box, Typography, Tabs, Tab, Paper, Button, Select, MenuItem,
    FormControl, InputLabel, Alert, CircularProgress, Chip, Stack,
    IconButton, Tooltip, TextField, Autocomplete
} from '@mui/material';
import { DataGrid, GridColDef, GridPaginationModel, GridToolbar, GridFilterModel } from '@mui/x-data-grid';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import axios from 'axios';
import PromoteLeadDialog from '@/components/PromoteLeadDialog';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import MapIcon from '@mui/icons-material/Map';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AddOwnerDialog from '@/components/AddOwnerDialog';

import { STATIC_LOCATIONS, ABBR_TO_PROVINCE } from '@/lib/locations';
import { useCountry } from '@/lib/country-context';

interface LeadSearch {
    id: number;
    country: string;
    city: string;
    source: string;
    status: string;
    resultCount: number | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
}

function TowerLeadsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { country: globalCountry } = useCountry();

    // Track mounted state to avoid updates on unmounted/discarded components
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Derive active tab from URL directly for stability
    const activeTab = useMemo(() => {
        const tab = searchParams.get('tab');
        return tab ? parseInt(tab, 10) : 0;
    }, [searchParams]);

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', newValue.toString());
        router.push(`${pathname}?${params.toString()}`);
    };

    // Tab 1: Tower Leads table state
    const [leads, setLeads] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
    const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
    const [externalFilters, setExternalFilters] = useState<{ province?: string; type?: string; source?: string }>({});
    const [isLoading, setIsLoading] = useState(false);

    // Filters for Tab 1
    const filterCountry = globalCountry || '';
    const [filterPromoted, setFilterPromoted] = useState('all');
    const [leadToPromote, setLeadToPromote] = useState<any>(null);
    const [addOwnerForTowerId, setAddOwnerForTowerId] = useState<number | null>(null);

    // Dynamic options for column filters
    const [filterProvinces, setFilterProvinces] = useState<string[]>([]);
    const [filterSources, setFilterSources] = useState<string[]>([]);
    const [filterTypes, setFilterTypes] = useState<string[]>([]);

    useEffect(() => {
        if (!filterCountry) {
            setFilterProvinces([]);
            setFilterSources([]);
            setFilterTypes([]);
            return;
        }
        const load = async () => {
            const countryParam = encodeURIComponent(filterCountry);
            try {
                // Fetch all distinct values in parallel
                const [provincesRes, sourcesRes, typesRes] = await Promise.all([
                    axios.get(`/api/tower-leads?distinct=provinces&country=${countryParam}`).catch(() => ({ data: [] })),
                    axios.get(`/api/tower-leads?distinct=sources&country=${countryParam}`).catch(() => ({ data: [] })),
                    axios.get(`/api/tower-leads?distinct=types&country=${countryParam}`).catch(() => ({ data: [] })),
                ]);

                if (isMounted.current) {
                    setFilterProvinces(provincesRes.data || []);
                    setFilterSources(sourcesRes.data || []);
                    setFilterTypes(typesRes.data || []);
                }
            } catch (error) {
                console.error("Failed to load filter options", error);
            }
        };
        load();
    }, [filterCountry]);

    // Tab 2: Find leads form state
    const [selectedProvince, setSelectedProvince] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [searchHistory, setSearchHistory] = useState<LeadSearch[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    const searchProvinces = globalCountry ? Object.keys(STATIC_LOCATIONS[globalCountry] || {}) : [];
    const searchCities = (globalCountry && selectedProvince)
        ? STATIC_LOCATIONS[globalCountry][selectedProvince] || []
        : [];

    // Load tower leads for Tab 1
    const loadLeads = useCallback(async () => {
        if (!isMounted.current) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: paginationModel.page.toString(),
                limit: paginationModel.pageSize.toString(),
            });

            if (filterCountry) params.append('country', filterCountry);
            if (filterPromoted !== 'all') params.append('promoted', filterPromoted);

            // Handle column filters (DataGrid) + External
            const effectiveFilters = { ...externalFilters };
            filterModel.items.forEach((item) => {
                if (!item.value) return;
                // Map DataGrid fields to API params
                // Supported: city, province, source, type, country (if overridden)
                if (['city', 'province', 'source', 'type', 'country'].includes(item.field)) {
                    (effectiveFilters as any)[item.field] = item.value;
                }
            });

            if (effectiveFilters.province) params.append('province', effectiveFilters.province);
            if (effectiveFilters.type) params.append('type', effectiveFilters.type);
            if (effectiveFilters.source) params.append('source', effectiveFilters.source);
            if ((effectiveFilters as any).city) params.append('city', (effectiveFilters as any).city);

            const res = await axios.get(`/api/tower-leads?${params.toString()}`);
            if (isMounted.current) {
                setLeads(res.data.data || []);
                setTotalCount(res.data.totalCount || 0);
            }
        } catch (error) {
            console.error('Error loading tower leads:', error);
            if (isMounted.current) {
                setLeads([]);
                setTotalCount(0);
            }
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    }, [paginationModel, filterCountry, filterPromoted, filterModel, externalFilters]);

    const [isFixingProvinces, setIsFixingProvinces] = useState(false);
    const handleFixProvinces = async () => {
        if (isFixingProvinces) return;
        setIsFixingProvinces(true);
        try {
            let processed = 0;
            let updated = 0;
            // Process in chunks of 5 to avoid timeouts and provide feedback
            // We loop until API says 0 remaining or we hit an error
            while (true) {
                if (!isMounted.current) break;

                const res = await axios.post('/api/admin/fix-provinces?limit=5&mode=missing');
                const data = res.data;

                processed += data.processed;
                updated += data.updated;

                if (data.processed === 0 || data.remaining === 0) {
                    break;
                }

                // Small delay to be polite to client UI as well
                await new Promise(r => setTimeout(r, 500));
            }
            // Reload leads to show changes
            loadLeads();
            alert(`Fixed provinces for ${updated} leads.`);
        } catch (error) {
            console.error('Error fixing provinces:', error);
            alert('Failed to fix provinces. Check console for details.');
        } finally {
            if (isMounted.current) setIsFixingProvinces(false);
        }
    };

    // Load search history for Tab 2
    const loadSearchHistory = useCallback(async () => {
        if (!isMounted.current) return;
        setIsHistoryLoading(true);
        try {
            const res = await axios.get('/api/tower-leads/search');
            if (isMounted.current) setSearchHistory(res.data || []);
        } catch (error) {
            console.error('Error loading search history:', error);
        } finally {
            if (isMounted.current) setIsHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        // Only load data if we are actually on the tower-leads page
        if (pathname === '/tower-leads') {
            if (activeTab === 0) loadLeads();
            else loadSearchHistory();
        }
    }, [activeTab, loadLeads, loadSearchHistory, pathname]);

    const handleFindLeads = async () => {
        if (!globalCountry) return;
        setIsSubmitting(true);
        setSubmitMessage(null);
        try {
            const res = await axios.post('/api/tower-leads/search', {
                country: globalCountry,
                province: selectedProvince || undefined,
                city: selectedCity,
            });
            if (isMounted.current) {
                setSubmitMessage({
                    type: 'success',
                    text: res.data.message || `Search queued for ${selectedCity}, ${globalCountry}`,
                });
                loadSearchHistory();
            }
        } catch (error: any) {
            if (isMounted.current) {
                setSubmitMessage({
                    type: 'error',
                    text: error.response?.data?.error || 'Failed to queue lead search',
                });
            }
        } finally {
            if (isMounted.current) setIsSubmitting(false);
        }
    };

    // Memoized DataGrid columns to prevent unnecessary re-renders
    const leadColumns: GridColDef[] = useMemo(() => [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'lat', headerName: 'Latitude', width: 120 },
        { field: 'lon', headerName: 'Longitude', width: 120 },
        {
            field: 'source',
            headerName: 'Source',
            width: 130,
            type: 'singleSelect',
            valueOptions: filterSources,
        },
        {
            field: 'type',
            headerName: 'Type',
            width: 100,
            type: 'singleSelect',
            valueOptions: filterTypes,
        },
        { field: 'country', headerName: 'Country', width: 120 },
        {
            field: 'province',
            headerName: 'Province',
            width: 120,
            type: 'singleSelect',
            valueOptions: filterProvinces,
            valueFormatter: (value: any) => {
                if (!value) return '';
                return ABBR_TO_PROVINCE[value] || value;
            }
        },
        { field: 'city', headerName: 'City', width: 130 },
        {
            field: 'promotedToTowerId',
            headerName: 'Promoted',
            width: 100,
            renderCell: (params) => params.value ? (
                <Chip label="Yes" color="success" size="small" />
            ) : (
                <Chip label="No" variant="outlined" size="small" />
            ),
        },
        {
            field: 'createdAt',
            headerName: 'Created',
            width: 160,
            valueGetter: (value: any) => value ? new Date(value).toLocaleDateString() : '',
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 150,
            sortable: false,
            renderCell: (params) => {
                const lead = params.row;
                const isPromoted = !!lead.promotedToTowerId;

                return (
                    <Stack direction="row" spacing={1}>
                        <Tooltip title="View Satellite">
                            <IconButton
                                size="small"
                                color="primary"
                                href={`https://www.google.com/maps/@${lead.lat},${lead.lon},18z/data=!3m1!1e1`}
                                target="_blank"
                            >
                                <SatelliteAltIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Show in Map">
                            <IconButton
                                size="small"
                                color="secondary"
                                component={Link}
                                href={`/?lat=${lead.lat}&lon=${lead.lon}&zoom=18&city=${encodeURIComponent(lead.city || '')}&country=${encodeURIComponent(lead.country || '')}`}
                            >
                                <MapIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>

                        {!isPromoted && (
                            <Tooltip title="Promote to Tower">
                                <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => setLeadToPromote(lead)}
                                >
                                    <AddLocationAltIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}

                        {isPromoted && (
                            <Tooltip title="Add Property Owner">
                                <IconButton
                                    size="small"
                                    color="warning"
                                    onClick={() => setAddOwnerForTowerId(lead.promotedToTowerId)}
                                >
                                    <PersonAddIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                );
            }
        }
    ], [filterProvinces, filterSources, filterTypes]);

    const searchColumns: GridColDef[] = useMemo(() => [
        { field: 'id', headerName: 'ID', width: 60 },
        { field: 'country', headerName: 'Country', width: 120 },
        {
            field: 'province',
            headerName: 'Province',
            width: 120,
            valueFormatter: (value: any) => {
                if (!value) return '';
                return ABBR_TO_PROVINCE[value] || value;
            }
        },
        { field: 'city', headerName: 'City', width: 130 },
        { field: 'source', headerName: 'Source', width: 140 },
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            renderCell: (params) => {
                const colorMap: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
                    'pending': 'warning',
                    'processing': 'info',
                    'completed': 'success',
                    'failed': 'error',
                };
                return (
                    <Chip
                        label={params.value}
                        color={colorMap[params.value] || 'default'}
                        size="small"
                    />
                );
            },
        },
        { field: 'resultCount', headerName: 'Results', width: 90 },
        { field: 'error', headerName: 'Error', width: 200 },
        {
            field: 'createdAt',
            headerName: 'Requested',
            width: 160,
            valueGetter: (value: any) => value ? new Date(value).toLocaleString() : '',
        },
    ], []);

    return (
        <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
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
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                    Tower Leads
                </Typography>
            </Box>

            <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
                <Tab label="Tower Leads" />
                <Tab label="Find Tower Leads" />
            </Tabs>

            {activeTab === 0 && (
                <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={filterPromoted}
                                label="Status"
                                onChange={(e) => setFilterPromoted(e.target.value)}
                            >
                                <MenuItem value="all">All</MenuItem>
                                <MenuItem value="false">Not Promoted</MenuItem>
                                <MenuItem value="true">Promoted</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>{globalCountry === 'USA' ? 'State' : 'Province'}</InputLabel>
                            <Select
                                value={externalFilters.province || ''}
                                label={globalCountry === 'USA' ? 'State' : 'Province'}
                                onChange={(e) => setExternalFilters(prev => ({ ...prev, province: e.target.value }))}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {filterProvinces.map(p => <MenuItem key={p} value={p}>{ABBR_TO_PROVINCE[p] || p}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Type</InputLabel>
                            <Select
                                value={externalFilters.type || ''}
                                label="Type"
                                onChange={(e) => setExternalFilters(prev => ({ ...prev, type: e.target.value }))}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {filterTypes.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Source</InputLabel>
                            <Select
                                value={externalFilters.source || ''}
                                label="Source"
                                onChange={(e) => setExternalFilters(prev => ({ ...prev, source: e.target.value }))}
                            >
                                <MenuItem value=""><em>All</em></MenuItem>
                                {filterSources.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                            </Select>
                        </FormControl>

                        {Object.keys(externalFilters).some(k => (externalFilters as any)[k]) && (
                            <Button size="small" onClick={() => setExternalFilters({})}>
                                Clear Filters
                            </Button>
                        )}

                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleFixProvinces}
                            disabled={isFixingProvinces}
                            startIcon={isFixingProvinces ? <CircularProgress size={16} /> : null}
                        >
                            {isFixingProvinces ? 'Fixing Provinces...' : 'Fix Missing Provinces'}
                        </Button>
                    </Box>

                    <DataGrid
                        rows={leads}
                        columns={leadColumns}
                        rowCount={totalCount}
                        loading={isLoading}
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        paginationMode="server"
                        filterMode="server"
                        filterModel={filterModel}
                        onFilterModelChange={setFilterModel}
                        pageSizeOptions={[10, 25, 50, 100]}
                        disableRowSelectionOnClick
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                            },
                        }}
                        sx={{
                            border: 'none',
                            '& .MuiDataGrid-cell': { borderBottom: '1px solid #333' },
                            '& .MuiDataGrid-columnHeaders': { bgcolor: '#1a1a1a' },
                        }}
                    />
                    <PromoteLeadDialog
                        open={!!leadToPromote}
                        lead={leadToPromote}
                        onClose={() => setLeadToPromote(null)}
                        onSuccess={() => loadLeads()}
                    />
                    <AddOwnerDialog
                        open={!!addOwnerForTowerId}
                        onClose={() => setAddOwnerForTowerId(null)}
                        onSuccess={() => loadLeads()}
                        towerId={addOwnerForTowerId || undefined}
                    />
                </Paper>
            )}

            {activeTab === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <Paper sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <FormControl sx={{ minWidth: 200 }}>
                                <InputLabel>Province/State</InputLabel>
                                <Select
                                    value={selectedProvince}
                                    onChange={(e) => {
                                        setSelectedProvince(e.target.value);
                                        setSelectedCity('');
                                    }}
                                    label="Province/State"
                                    disabled={!globalCountry}
                                >
                                    {searchProvinces.map((p) => (
                                        <MenuItem key={p} value={p}>{p}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Autocomplete
                                freeSolo
                                options={searchCities}
                                value={selectedCity}
                                onInputChange={(_, newInputValue) => setSelectedCity(newInputValue)}
                                disabled={!globalCountry}
                                renderInput={(params) => (
                                    <TextField {...params} label="City" />
                                )}
                                sx={{ minWidth: 200 }}
                            />

                            <Button
                                variant="contained"
                                onClick={handleFindLeads}
                                disabled={!globalCountry || isSubmitting}
                                sx={{ height: 56 }}
                            >
                                {isSubmitting ? <CircularProgress size={24} /> : 'Find Leads'}
                            </Button>
                        </Box>
                        {submitMessage && (
                            <Alert severity={submitMessage.type} sx={{ mt: 2 }}>
                                {submitMessage.text}
                            </Alert>
                        )}
                    </Paper>

                    <Paper sx={{ flex: 1 }}>
                        <Typography variant="h6" sx={{ p: 2, pb: 0 }}>
                            Search History
                        </Typography>
                        <Box sx={{ height: 400 }}>
                            <DataGrid
                                rows={searchHistory}
                                columns={searchColumns}
                                loading={isHistoryLoading}
                                pageSizeOptions={[10, 25]}
                                initialState={{
                                    pagination: { paginationModel: { pageSize: 10 } },
                                }}
                                disableRowSelectionOnClick
                                sx={{
                                    border: 'none',
                                    '& .MuiDataGrid-cell': { borderBottom: '1px solid #333' },
                                    '& .MuiDataGrid-columnHeaders': { bgcolor: '#1a1a1a' },
                                }}
                            />
                        </Box>
                    </Paper>
                </Box>
            )}
        </Box>
    );
}

export default function TowerLeadsPage() {
    return (
        <Suspense fallback={<Box sx={{ p: 3 }}><CircularProgress /></Box>}>
            <TowerLeadsContent />
        </Suspense>
    );
}
