'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import {
    Box, Typography, Tabs, Tab, Paper, Button, Select, MenuItem,
    FormControl, InputLabel, Alert, CircularProgress, Chip, Stack,
    IconButton, Tooltip
} from '@mui/material';
import { DataGrid, GridColDef, GridPaginationModel, GridToolbar } from '@mui/x-data-grid';
import axios from 'axios';
import PromoteLeadDialog from '@/components/PromoteLeadDialog';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import MapIcon from '@mui/icons-material/Map';

// Static lookup for available cities per country (matches job-handlers.ts)
const COUNTRY_CITIES: Record<string, string[]> = {
    'Canada': [
        'Calgary', 'Charlottetown', 'Edmonton', 'Fredericton', 'Halifax',
        'Moncton', 'Montreal', 'Ottawa', 'Quebec City', 'Regina',
        'Saskatoon', "St. John's", 'Toronto', 'Vancouver', 'Victoria', 'Winnipeg',
    ],
    'USA': ['Chicago', 'Houston', 'Los Angeles', 'Miami', 'New York'],

};

const COUNTRIES = Object.keys(COUNTRY_CITIES);

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
    const [activeTab, setActiveTab] = useState(0);

    // Tab 1: Tower Leads table state
    const [leads, setLeads] = useState<any[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
    const [isLoading, setIsLoading] = useState(false);

    // Filters for Tab 1
    const [filterCountry, setFilterCountry] = useState('');
    const [filterCity, setFilterCity] = useState('');
    const [filterPromoted, setFilterPromoted] = useState('all'); // all, true, false
    const [leadToPromote, setLeadToPromote] = useState<any>(null);

    // Tab 2: Find leads form state
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [searchHistory, setSearchHistory] = useState<LeadSearch[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    // Load tower leads for Tab 1
    const loadLeads = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: paginationModel.page.toString(),
                limit: paginationModel.pageSize.toString(),
            });

            if (filterCountry) params.append('country', filterCountry);
            if (filterCity) params.append('city', filterCity);
            if (filterPromoted !== 'all') params.append('promoted', filterPromoted);

            const res = await axios.get(`/api/tower-leads?${params.toString()}`);
            setLeads(res.data.data || []);
            setTotalCount(res.data.totalCount || 0);
        } catch (error) {
            console.error('Error loading tower leads:', error);
        } finally {
            setIsLoading(false);
        }
    }, [paginationModel, filterCountry, filterCity, filterPromoted]);

    // Load search history for Tab 2
    const loadSearchHistory = useCallback(async () => {
        setIsHistoryLoading(true);
        try {
            const res = await axios.get('/api/tower-leads/search');
            setSearchHistory(res.data || []);
        } catch (error) {
            console.error('Error loading search history:', error);
        } finally {
            setIsHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 0) {
            loadLeads();
        } else {
            loadSearchHistory();
        }
    }, [activeTab, loadLeads, loadSearchHistory]);

    // Handle find leads submission
    const handleFindLeads = async () => {
        if (!selectedCountry || !selectedCity) return;

        setIsSubmitting(true);
        setSubmitMessage(null);

        try {
            const res = await axios.post('/api/tower-leads/search', {
                country: selectedCountry,
                city: selectedCity,
            });

            setSubmitMessage({
                type: 'success',
                text: res.data.message || `Search queued for ${selectedCity}, ${selectedCountry}`,
            });

            // Refresh search history
            loadSearchHistory();
        } catch (error: any) {
            setSubmitMessage({
                type: 'error',
                text: error.response?.data?.error || 'Failed to queue lead search',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // DataGrid columns for tower leads
    const leadColumns: GridColDef[] = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'lat', headerName: 'Latitude', width: 120 },
        { field: 'lon', headerName: 'Longitude', width: 120 },
        { field: 'source', headerName: 'Source', width: 130 },
        { field: 'type', headerName: 'Type', width: 100 },
        { field: 'country', headerName: 'Country', width: 120 },
        { field: 'city', headerName: 'City', width: 130 },
        { field: 'province', headerName: 'Province', width: 120 },
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
                    </Stack>
                );
            }
        }
    ];

    // DataGrid columns for search history
    const searchColumns: GridColDef[] = [
        { field: 'id', headerName: 'ID', width: 60 },
        { field: 'country', headerName: 'Country', width: 120 },
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
    ];

    const availableCities = selectedCountry ? COUNTRY_CITIES[selectedCountry] || [] : [];

    return (
        <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
                Tower Leads
            </Typography>

            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Tower Leads" />
                <Tab label="Find Tower Leads" />
            </Tabs>

            {/* Tab 1: Tower Leads Table */}
            {activeTab === 0 && (
                <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
                    {/* Filters */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Country</InputLabel>
                            <Select
                                value={filterCountry}
                                label="Country"
                                onChange={(e) => {
                                    setFilterCountry(e.target.value);
                                    setFilterCity('');
                                }}
                            >
                                <MenuItem value="">All Countries</MenuItem>
                                {COUNTRIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>City</InputLabel>
                            <Select
                                value={filterCity}
                                label="City"
                                onChange={(e) => setFilterCity(e.target.value)}
                                disabled={!filterCountry}
                            >
                                <MenuItem value="">All Cities</MenuItem>
                                {(filterCountry ? COUNTRY_CITIES[filterCountry] : []).map(c => (
                                    <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

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
                    </Box>

                    <DataGrid
                        rows={leads}
                        columns={leadColumns}
                        rowCount={totalCount}
                        loading={isLoading}
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        paginationMode="server"
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
                </Paper>
            )}

            {/* Tab 2: Find Tower Leads */}
            {activeTab === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Search Form */}
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            Search for Tower Leads
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Select a country and city to find tower and mast leads from OpenStreetMap. The search will be queued and processed in the background.
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <FormControl sx={{ minWidth: 200 }}>
                                <InputLabel>Country</InputLabel>
                                <Select
                                    value={selectedCountry}
                                    onChange={(e) => {
                                        setSelectedCountry(e.target.value);
                                        setSelectedCity(''); // Reset city when country changes
                                    }}
                                    label="Country"
                                >
                                    {COUNTRIES.map((c) => (
                                        <MenuItem key={c} value={c}>{c}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl sx={{ minWidth: 200 }}>
                                <InputLabel>City</InputLabel>
                                <Select
                                    value={selectedCity}
                                    onChange={(e) => setSelectedCity(e.target.value)}
                                    label="City"
                                    disabled={!selectedCountry}
                                >
                                    {availableCities.map((c) => (
                                        <MenuItem key={c} value={c}>{c}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button
                                variant="contained"
                                onClick={handleFindLeads}
                                disabled={!selectedCountry || !selectedCity || isSubmitting}
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

                    {/* Search History */}
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
