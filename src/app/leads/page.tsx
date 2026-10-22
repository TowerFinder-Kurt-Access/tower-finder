'use client';
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import { LEAD_STAGE_LABELS } from '@/lib/leads';

type LeadStage = keyof typeof LEAD_STAGE_LABELS;

interface LeadRow {
    id: number;
    stage: LeadStage;
    contactPerson: string | null;
    companyName: string | null;
    actions: string | null;
    remarks: string | null;
    brettStatus: string | null;
    emailFollowUp: boolean;
    towerId: number;
    address: string | null;
    city: string | null;
    state: string | null;
    ownerName: string | null;
    ownerType: string | null;
    ownerPhone: string | null;
}

const STAGES = Object.keys(LEAD_STAGE_LABELS) as LeadStage[];

const wrapCell = (value: string | null) => (
    <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.35 }}>
        {value || '–'}
    </Typography>
);

function LeadsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeStage = (searchParams.get('stage') || '') as LeadStage | '';

    const [rows, setRows] = useState<LeadRow[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Partial<Record<LeadStage, number>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 50 });

    const handleStageChange = (_: React.SyntheticEvent, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set('stage', value);
        else params.delete('stage');
        router.push(params.size ? `/leads?${params.toString()}` : '/leads');
    };

    const handleSearchSubmit = (event?: React.FormEvent) => {
        event?.preventDefault();
        setSearch(searchInput.trim());
        setPaginationModel((prev) => ({ ...prev, page: 0 }));
    };

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get('/api/leads', {
                    params: {
                        stage: activeStage || undefined,
                        search: search || undefined,
                        page: paginationModel.page,
                        limit: paginationModel.pageSize,
                    },
                    signal: controller.signal,
                });
                setRows(response.data.data);
                setTotal(response.data.total);
                setCounts(response.data.counts);
            } catch (err) {
                if (axios.isCancel(err)) return;
                console.error('Failed to load leads', err);
                setError('Failed to load leads.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        load();
        return () => controller.abort();
    }, [activeStage, search, paginationModel]);

    const allCount = useMemo(
        () => Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0),
        [counts]
    );

    const columns: GridColDef<LeadRow>[] = [
        {
            field: 'towerId',
            headerName: 'Tower',
            width: 100,
            renderCell: (params) => (
                <Link href={`/towers/${params.row.towerId}`} onClick={(event) => event.stopPropagation()}>
                    #{params.row.towerId}
                </Link>
            ),
        },
        { field: 'stage', headerName: 'Stage', width: 160, renderCell: (params) => <Chip label={LEAD_STAGE_LABELS[params.row.stage]} size="small" variant="outlined" /> },
        {
            field: 'contactPerson',
            headerName: 'Contact Person',
            width: 180,
            renderCell: (params) => (
                <Typography variant="body2" sx={{ fontWeight: params.row.contactPerson ? 500 : 400 }} color={params.row.contactPerson ? 'inherit' : 'text.secondary'}>
                    {params.row.contactPerson || '–'}
                </Typography>
            ),
        },
        { field: 'companyName', headerName: 'Company', width: 220, renderCell: (params) => wrapCell(params.row.companyName) },
        { field: 'actions', headerName: 'Actions', width: 240, renderCell: (params) => wrapCell(params.row.actions) },
        { field: 'remarks', headerName: 'Remarks', width: 240, renderCell: (params) => wrapCell(params.row.remarks) },
        {
            field: 'ownerName',
            headerName: 'Property Owner',
            width: 200,
            renderCell: (params) => (
                <Box>
                    <Typography variant="body2">{params.row.ownerName || '–'}</Typography>
                    {params.row.ownerPhone && (
                        <Typography variant="caption" color="text.secondary">{params.row.ownerPhone}</Typography>
                    )}
                </Box>
            ),
        },
        { field: 'city', headerName: 'City', width: 140, renderCell: (params) => wrapCell(params.row.city) },
        {
            field: 'emailFollowUp',
            headerName: 'Email Follow-up',
            width: 130,
            renderCell: (params) => params.row.emailFollowUp
                ? <Chip label="Needed" size="small" color="warning" />
                : <Typography variant="body2" color="text.secondary">–</Typography>,
        },
        {
            field: 'brettStatus',
            headerName: 'Brett Status',
            width: 120,
            renderCell: (params) => params.row.brettStatus
                ? <Chip label={params.row.brettStatus} size="small" color="error" variant="outlined" />
                : <Typography variant="body2" color="text.secondary">–</Typography>,
        },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', p: 2, gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="h5" fontWeight={600}>Leads</Typography>
                    <Typography variant="body2" color="text.secondary">
                        CellWaves outreach workbook, all tabs.
                    </Typography>
                </Box>
                <Box component="form" onSubmit={handleSearchSubmit} sx={{ ml: 'auto', minWidth: 280 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Search contact, company, actions, remarks"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                </Box>
            </Box>

            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Tabs value={activeStage} onChange={handleStageChange} variant="scrollable" allowScrollButtonsMobile>
                    <Tab value="" label={`All (${allCount})`} />
                    {STAGES.map((stage) => (
                        <Tab key={stage} value={stage} label={`${LEAD_STAGE_LABELS[stage]} (${counts[stage] ?? 0})`} />
                    ))}
                </Tabs>

                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                    <DataGrid<LeadRow>
                        rows={rows}
                        columns={columns}
                        loading={loading}
                        rowCount={total}
                        paginationMode="server"
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        pageSizeOptions={[25, 50, 100]}
                        disableRowSelectionOnClick
                        getRowHeight={() => 'auto'}
                        sx={{
                            border: 0,
                            '& .MuiDataGrid-cell': { py: 1, alignItems: 'center' },
                        }}
                        slots={{
                            noRowsOverlay: () => (
                                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Typography color={error ? 'error' : 'text.secondary'}>{error || 'No leads found.'}</Typography>
                                </Box>
                            ),
                        }}
                    />
                </Box>
            </Paper>
        </Box>
    );
}

export default function LeadsPage() {
    return (
        <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><CircularProgress /></Box>}>
            <LeadsContent />
        </Suspense>
    );
}
