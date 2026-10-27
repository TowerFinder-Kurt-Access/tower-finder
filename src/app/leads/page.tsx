'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import { LEAD_STAGE_LABELS, type LeadRow } from '@/lib/leads';
import { useSnackbar } from '@/components/GlobalSnackbar';

type StageOption = { key: string; label: string; system: boolean };

interface TowerOption {
    id: number;
    address: string | null;
    city: string | null;
    state: string | null;
    type: string | null;
    ownerName: string | null;
    ownerType: string | null;
}

const PAGE_SIZE = 50;
const NEW_STAGE_VALUE = '__new_stage__';

const ROW_GRID = {
    xs: 'minmax(0, 1fr) auto auto',
    lg: 'minmax(180px, 1.4fr) minmax(180px, 1.2fr) minmax(140px, 1fr) 136px 84px',
} as const;

const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const sectionLabel = {
    color: 'text.secondary',
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: '0.04em',
} as const;

interface LeadFormValues {
    towerId: string;
    stage: string;
    contactPerson: string;
    companyName: string;
    actions: string;
    remarks: string;
    brettStatus: string;
    emailFollowUp: boolean;
}

const EMPTY_FORM: LeadFormValues = {
    towerId: '',
    stage: 'PROSPECTIVE',
    contactPerson: '',
    companyName: '',
    actions: '',
    remarks: '',
    brettStatus: '',
    emailFollowUp: false,
};

const formFromRow = (row: LeadRow): LeadFormValues => ({
    towerId: String(row.towerId),
    stage: row.stage,
    contactPerson: row.contactPerson ?? '',
    companyName: row.companyName ?? '',
    actions: row.actions ?? '',
    remarks: row.remarks ?? '',
    brettStatus: row.brettStatus ?? '',
    emailFollowUp: row.emailFollowUp,
});

type DrawerState = { mode: 'view' | 'edit'; lead: LeadRow } | { mode: 'create' } | null;

function LeadsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeStage = searchParams.get('stage') || '';
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const { showSnackbar } = useSnackbar();

    const [rows, setRows] = useState<LeadRow[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
    const [stages, setStages] = useState<StageOption[]>([]);
    const [stageDialogOpen, setStageDialogOpen] = useState(false);
    const [stageName, setStageName] = useState('');
    const [stageSaving, setStageSaving] = useState(false);
    const [stageError, setStageError] = useState<string | null>(null);
    const [stageEditOpen, setStageEditOpen] = useState(false);
    const [stageEditKey, setStageEditKey] = useState('');
    const [stageEditLabel, setStageEditLabel] = useState('');
    const [stageEditSaving, setStageEditSaving] = useState(false);
    const [stageEditError, setStageEditError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);

    const [drawer, setDrawer] = useState<DrawerState>(null);
    const [form, setForm] = useState<LeadFormValues>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [selectedTower, setSelectedTower] = useState<TowerOption | null>(null);
    const [towerOptions, setTowerOptions] = useState<TowerOption[]>([]);
    const [towerQuery, setTowerQuery] = useState('');
    const [towerLoading, setTowerLoading] = useState(false);

    // Debounced lookup so typing an address does not fire a request per keystroke.
    useEffect(() => {
        const query = towerQuery.trim();
        if (query.length === 0) return;

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setTowerLoading(true);
            try {
                const response = await axios.get('/api/towers/options', {
                    params: { q: query },
                    signal: controller.signal,
                });
                setTowerOptions(response.data);
            } catch (err) {
                if (!axios.isCancel(err)) console.error('Tower search failed', err);
            } finally {
                if (!controller.signal.aborted) setTowerLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [towerQuery]);

    // Stage tabs, including user-created stages.
    useEffect(() => {
        axios.get<StageOption[]>('/api/lead-stages')
            .then((response) => setStages(response.data))
            .catch((err) => console.error('Failed to load lead stages', err));
    }, []);

    const stageLabel = (key: string) =>
        stages.find((stage) => stage.key === key)?.label
        ?? LEAD_STAGE_LABELS[key as keyof typeof LEAD_STAGE_LABELS]
        ?? key;

    const updateTowerQuery = (value: string) => {
        setTowerQuery(value);
        if (value.trim().length === 0) {
            setTowerOptions([]);
            setTowerLoading(false);
        }
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
                        page,
                        limit: PAGE_SIZE,
                    },
                    signal: controller.signal,
                });
                setRows(response.data.data);
                setTotal(response.data.total);
                setCounts(response.data.counts);
            } catch (err) {
                if (axios.isCancel(err)) return;
                console.error('Failed to load leads', err);
                setError('Could not load leads. Check the connection and retry.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        load();
        return () => controller.abort();
    }, [activeStage, search, page, reloadKey]);

    const allCount = useMemo(
        () => Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0),
        [counts]
    );

    const selectStage = (stage: string | '') => {
        setPage(0);
        setDrawer(null);
        if (stage) router.push(`/leads?stage=${stage}`);
        else router.push('/leads');
    };

    const submitSearch = (event?: React.FormEvent) => {
        event?.preventDefault();
        setPage(0);
        setSearch(searchInput.trim());
    };

    const clearFilters = () => {
        setSearchInput('');
        setSearch('');
        setPage(0);
        router.push('/leads');
    };

    const openLead = (lead: LeadRow) => {
        setForm(formFromRow(lead));
        setSelectedTower({
            id: lead.towerId,
            address: lead.address,
            city: lead.city,
            state: lead.state,
            type: null,
            ownerName: lead.ownerName,
            ownerType: lead.ownerType,
        });
        updateTowerQuery('');
        setFormError(null);
        setDrawer({ mode: 'view', lead });
    };

    const openCreate = () => {
        setForm({ ...EMPTY_FORM, stage: activeStage || stages[0]?.key || 'PROSPECTIVE' });
        setSelectedTower(null);
        updateTowerQuery('');
        setFormError(null);
        setDrawer({ mode: 'create' });
    };

    const closeDrawer = () => {
        if (saving) return;
        setDrawer(null);
        setFormError(null);
    };

    const updateForm = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const save = async () => {
        if (!drawer) return;
        setFormError(null);

        const towerId = Number(form.towerId);
        if (!Number.isInteger(towerId) || towerId <= 0) {
            setFormError('Select a tower for this lead.');
            return;
        }

        const payload = {
            towerId,
            stage: form.stage,
            contactPerson: form.contactPerson || null,
            companyName: form.companyName || null,
            actions: form.actions || null,
            remarks: form.remarks || null,
            brettStatus: form.brettStatus || null,
            emailFollowUp: form.emailFollowUp,
        };

        setSaving(true);
        try {
            if (drawer.mode === 'create') {
                await axios.post('/api/leads', payload);
                showSnackbar(`Lead added to tower ${towerId}.`);
            } else {
                await axios.patch(`/api/leads/${drawer.lead.id}`, payload);
                showSnackbar('Lead updated.');
            }
            setDrawer(null);
            setReloadKey((key) => key + 1);
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data as { error?: string } | undefined)?.error
                : undefined;
            setFormError(message || 'Could not save the lead. Try again.');
        } finally {
            setSaving(false);
        }
    };

    const createStage = async () => {
        const label = stageName.trim();
        if (!label) {
            setStageError('Enter a stage name.');
            return;
        }

        setStageSaving(true);
        setStageError(null);
        try {
            const response = await axios.post<StageOption>('/api/lead-stages', { label });
            setStages((current) => [...current, response.data]);
            setStageDialogOpen(false);
            setStageName('');
            showSnackbar(`Stage "${response.data.label}" created.`);
            if (drawer && drawer.mode !== 'view') {
                updateForm('stage', response.data.key);
            } else {
                selectStage(response.data.key);
            }
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data as { error?: string } | undefined)?.error
                : undefined;
            setStageError(message || 'Could not create the stage.');
        } finally {
            setStageSaving(false);
        }
    };

    const openStageEdit = (stage: StageOption) => {
        setStageEditKey(stage.key);
        setStageEditLabel(stage.label);
        setStageEditError(null);
        setStageEditOpen(true);
    };

    const saveStageEdit = async () => {
        const label = stageEditLabel.trim();
        if (!label) {
            setStageEditError('Stage name is required.');
            return;
        }
        setStageEditSaving(true);
        setStageEditError(null);
        try {
            const response = await axios.patch<StageOption>(`/api/lead-stages/${encodeURIComponent(stageEditKey)}`, { label });
            setStages((current) => current.map((stage) => stage.key === stageEditKey ? response.data : stage));
            setStageEditOpen(false);
            showSnackbar('Stage renamed.');
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data as { error?: string } | undefined)?.error
                : undefined;
            setStageEditError(message || 'Could not rename the stage.');
        } finally {
            setStageEditSaving(false);
        }
    };

    const deleteStage = async (key: string) => {
        const stage = stages.find((entry) => entry.key === key);
        if (!window.confirm(`Delete the "${stage?.label ?? key}" stage?`)) return;
        try {
            await axios.delete(`/api/lead-stages/${encodeURIComponent(key)}`);
            setStages((current) => current.filter((entry) => entry.key !== key));
            if (activeStage === key) selectStage('');
            if (form.stage === key) updateForm('stage', 'PROSPECTIVE');
            showSnackbar('Stage deleted.');
        } catch (err) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data as { error?: string } | undefined)?.error
                : undefined;
            showSnackbar(message || 'Could not delete the stage.', 'error');
        }
    };

    const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const end = Math.min((page + 1) * PAGE_SIZE, total);
    const hasFilters = Boolean(search || activeStage);
    const drawerTitle = drawer?.mode === 'create'
        ? 'New lead'
        : drawer?.mode === 'view'
            ? (drawer.lead.contactPerson || drawer.lead.companyName || 'Lead')
            : 'Edit lead';

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 2, p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                        Leads
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {allCount} leads from the CellWaves outreach workbook, across all tabs.
                    </Typography>
                </Box>
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
                    <Box component="form" onSubmit={submitSearch} sx={{ flex: 1, minWidth: { sm: 300 } }}>
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
                                    endAdornment: searchInput ? (
                                        <InputAdornment position="end">
                                            <IconButton
                                                size="small"
                                                aria-label="Clear search"
                                                onClick={() => {
                                                    setSearchInput('');
                                                    setSearch('');
                                                    setPage(0);
                                                }}
                                            >
                                                <CloseIcon fontSize="small" />
                                            </IconButton>
                                        </InputAdornment>
                                    ) : undefined,
                                },
                            }}
                        />
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ flexShrink: 0 }}>
                        New lead
                    </Button>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                    label={`All ${allCount}`}
                    onClick={() => selectStage('')}
                    color={activeStage ? 'default' : 'primary'}
                    variant={activeStage ? 'outlined' : 'filled'}
                />
                {stages.map((stage) => (
                    <Chip
                        key={stage.key}
                        label={`${stage.label} ${counts[stage.key] ?? 0}`}
                        onClick={() => selectStage(stage.key)}
                        color={activeStage === stage.key ? 'primary' : 'default'}
                        variant={activeStage === stage.key ? 'filled' : 'outlined'}
                    />
                ))}
            </Box>

            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box
                    sx={{
                        display: { xs: 'none', lg: 'grid' },
                        gridTemplateColumns: ROW_GRID,
                        gap: 2,
                        px: 3,
                        py: 1.25,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    {['Lead', 'Actions', 'Remarks', 'Status', 'Tower'].map((label) => (
                        <Typography
                            key={label}
                            variant="caption"
                            sx={{ ...sectionLabel, textAlign: label === 'Tower' ? 'right' : 'left' }}
                        >
                            {label}
                        </Typography>
                    ))}
                </Box>

                <Box
                    sx={{
                        flex: 1,
                        overflowY: 'auto',
                        opacity: loading && rows.length > 0 ? 0.55 : 1,
                        transition: 'opacity 120ms ease',
                    }}
                >
                    {loading && rows.length === 0 && !error && (
                        <Box>
                            {Array.from({ length: 7 }).map((_, index) => (
                                <Box
                                    key={index}
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: ROW_GRID,
                                        gap: 2,
                                        px: 3,
                                        py: 2,
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                    }}
                                >
                                    <Box>
                                        <Skeleton width="60%" height={18} />
                                        <Skeleton width="80%" height={14} />
                                    </Box>
                                    <Box sx={{ display: { xs: 'none', lg: 'block' } }}><Skeleton width="85%" height={16} /></Box>
                                    <Box sx={{ display: { xs: 'none', lg: 'block' } }}><Skeleton width="90%" height={16} /></Box>
                                    <Skeleton width={110} height={22} />
                                    <Skeleton width={60} height={16} />
                                </Box>
                            ))}
                        </Box>
                    )}

                    {error && (
                        <Box sx={{ p: 3 }}>
                            <Alert
                                severity="error"
                                action={
                                    <Button color="inherit" size="small" onClick={() => setReloadKey((key) => key + 1)}>
                                        Retry
                                    </Button>
                                }
                            >
                                {error}
                            </Alert>
                        </Box>
                    )}

                    {!loading && !error && rows.length === 0 && (
                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, py: 10, px: 3, textAlign: 'center' }}>
                            <SearchOffIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                            <Box>
                                <Typography sx={{ fontWeight: 600 }}>No leads found</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {search ? `Nothing matches "${search}".` : 'This stage has no leads yet.'}
                                </Typography>
                            </Box>
                            {hasFilters ? (
                                <Button variant="outlined" onClick={clearFilters}>
                                    Clear filters
                                </Button>
                            ) : (
                                <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
                                    New lead
                                </Button>
                            )}
                        </Box>
                    )}

                    {!error && rows.map((row) => (
                        <Box
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openLead(row)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    openLead(row);
                                }
                            }}
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: ROW_GRID,
                                gap: 2,
                                px: 3,
                                py: 1.75,
                                alignItems: 'center',
                                cursor: 'pointer',
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                transition: 'background-color 120ms ease',
                                '&:last-of-type': { borderBottom: 0 },
                                '&:hover': { bgcolor: 'action.hover' },
                                '&:active': { transform: 'translateY(1px)' },
                                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                            }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 500, ...truncate }}>
                                    {row.contactPerson || row.companyName || 'No contact name'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={truncate}>
                                    {row.contactPerson
                                        ? (row.companyName || row.city || 'No company on file')
                                        : (row.city || 'No contact name')}
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', lg: 'block' }, ...truncate }}>
                                {row.actions || 'No action logged'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', lg: 'block' }, ...truncate }}>
                                {row.remarks || 'No remarks'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                                <Chip label={stageLabel(row.stage)} size="small" variant="outlined" />
                                {row.emailFollowUp && (
                                    <Tooltip title="Email follow-up needed">
                                        <MailOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                    </Tooltip>
                                )}
                            </Box>
                            <Link
                                component={NextLink}
                                href={`/towers/${row.towerId}`}
                                onClick={(event) => event.stopPropagation()}
                                sx={{ justifySelf: 'end', fontWeight: 500 }}
                            >
                                #{row.towerId}
                            </Link>
                        </Box>
                    ))}
                </Box>

                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                        px: 3,
                        py: 1,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    <Typography variant="body2" color="text.secondary">
                        {total === 0 ? 'No leads' : `${start}-${end} of ${total}`}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton size="small" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(current - 1, 0))}>
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" aria-label="Next page" disabled={end >= total || loading} onClick={() => setPage((current) => current + 1)}>
                            <ChevronRightIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
            </Paper>

            <Drawer
                anchor="right"
                open={drawer !== null}
                onClose={closeDrawer}
                transitionDuration={reduceMotion ? 0 : 200}
                slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 } } } }}
            >
                {drawer && (
                    <Box component="form" onSubmit={(event) => { event.preventDefault(); save(); }} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography component="h2" variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                                        {drawerTitle}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {drawer.mode === 'create'
                                            ? 'Attach a lead to an existing tower.'
                                            : drawer.mode === 'view'
                                                ? (drawer.lead.companyName || 'No company on file')
                                                : 'Edit the lead details.'}
                                    </Typography>
                                </Box>
                                <IconButton size="small" aria-label="Close lead details" onClick={closeDrawer} disabled={saving}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                            {drawer.mode === 'view' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                                    <Chip label={stageLabel(drawer.lead.stage)} size="small" variant="outlined" />
                                    {drawer.lead.emailFollowUp && <Chip label="Email follow-up" size="small" variant="outlined" />}
                                    {drawer.lead.brettStatus && <Chip label={drawer.lead.brettStatus} size="small" variant="outlined" />}
                                </Box>
                            )}
                        </Box>

                        {drawer.mode === 'view' ? (
                            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
                                <Box sx={{ display: 'grid', gap: 2.5 }}>
                                    <Box>
                                        <Typography sx={sectionLabel}>Actions</Typography>
                                        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                            {drawer.lead.actions || 'No action logged.'}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography sx={sectionLabel}>Remarks</Typography>
                                        <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                            {drawer.lead.remarks || 'No remarks.'}
                                        </Typography>
                                    </Box>
                                    <Divider />
                                    <Box>
                                        <Typography sx={sectionLabel}>Property owner</Typography>
                                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                                            {drawer.lead.ownerName || 'No owner record on file.'}
                                        </Typography>
                                        {drawer.lead.ownerPhone && (
                                            <Typography variant="body2" color="text.secondary">
                                                {drawer.lead.ownerPhone}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Box>
                                        <Typography sx={sectionLabel}>Location</Typography>
                                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                                            {drawer.lead.address || 'No address on file.'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {[drawer.lead.city, drawer.lead.state].filter(Boolean).join(', ') || 'No city on file.'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        ) : (
                            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5, display: 'grid', gap: 2 }}>
                                <Autocomplete
                                    size="small"
                                    options={towerOptions}
                                    value={selectedTower}
                                    loading={towerLoading}
                                    filterOptions={(options) => options}
                                    getOptionLabel={(option) => (option.city ? `#${option.id}, ${option.city}` : `#${option.id}`)}
                                    isOptionEqualToValue={(option, value) => option.id === value.id}
                                    onInputChange={(_event, value, reason) => {
                                        if (reason === 'input' || reason === 'clear') updateTowerQuery(value);
                                    }}
                                    onChange={(_event, option) => {
                                        setSelectedTower(option);
                                        if (!option) {
                                            updateForm('towerId', '');
                                            return;
                                        }
                                        setForm((current) => {
                                            const ownerIsPerson = option.ownerType?.toLowerCase() === 'individual';
                                            return {
                                                ...current,
                                                towerId: String(option.id),
                                                contactPerson: current.contactPerson || (ownerIsPerson ? (option.ownerName ?? '') : ''),
                                                companyName: current.companyName || (ownerIsPerson ? '' : (option.ownerName ?? '')),
                                            };
                                        });
                                    }}
                                    noOptionsText={
                                        towerQuery.trim().length === 0
                                            ? 'Type a tower ID, address, or city.'
                                            : 'No towers found.'
                                    }
                                    renderOption={({ key, ...optionProps }, option) => (
                                        <Box component="li" key={key} {...optionProps} sx={{ gap: 0, alignItems: 'flex-start' }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    #{option.id} {option.address || 'No address'}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {[option.city, option.state, option.ownerName].filter(Boolean).join(', ')}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    )}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Tower"
                                            placeholder="Search by ID, address, or city"
                                            helperText="Picking a tower fills the contact or company from its property owner."
                                        />
                                    )}
                                />
                                <TextField
                                    select
                                    size="small"
                                    label="Stage"
                                    value={form.stage}
                                    SelectProps={{
                                        renderValue: (value) => stageLabel(String(value)),
                                    }}
                                    onChange={(event) => {
                                        if (event.target.value === NEW_STAGE_VALUE) {
                                            setStageName('');
                                            setStageError(null);
                                            setStageDialogOpen(true);
                                            return;
                                        }
                                        updateForm('stage', event.target.value);
                                    }}
                                >
                                    {stages.map((stage) => (
                                        <MenuItem
                                            key={stage.key}
                                            value={stage.key}
                                            sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
                                        >
                                            <span>{stage.label}</span>
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <IconButton
                                                    size="small"
                                                    aria-label={`Edit ${stage.label}`}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openStageEdit(stage);
                                                    }}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    aria-label={`Delete ${stage.label}`}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void deleteStage(stage.key);
                                                    }}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        </MenuItem>
                                    ))}
                                    <MenuItem value={NEW_STAGE_VALUE} sx={{ gap: 1 }}>
                                        <AddIcon fontSize="small" />
                                        Add New Status
                                    </MenuItem>
                                </TextField>
                                <TextField
                                    size="small"
                                    label="Contact person"
                                    value={form.contactPerson}
                                    onChange={(event) => updateForm('contactPerson', event.target.value)}
                                />
                                <TextField
                                    size="small"
                                    label="Company"
                                    value={form.companyName}
                                    onChange={(event) => updateForm('companyName', event.target.value)}
                                />
                                <TextField
                                    size="small"
                                    label="Actions"
                                    value={form.actions}
                                    onChange={(event) => updateForm('actions', event.target.value)}
                                    multiline
                                    minRows={2}
                                />
                                <TextField
                                    size="small"
                                    label="Remarks"
                                    value={form.remarks}
                                    onChange={(event) => updateForm('remarks', event.target.value)}
                                    multiline
                                    minRows={3}
                                />
                                <TextField
                                    size="small"
                                    label="Brett status"
                                    value={form.brettStatus}
                                    onChange={(event) => updateForm('brettStatus', event.target.value)}
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={form.emailFollowUp}
                                            onChange={(event) => updateForm('emailFollowUp', event.target.checked)}
                                        />
                                    }
                                    label="Email follow-up needed"
                                />
                                {formError && <Alert severity="error">{formError}</Alert>}
                            </Box>
                        )}

                        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
                            {drawer.mode === 'view' ? (
                                <>
                                    <Button
                                        variant="outlined"
                                        startIcon={<EditIcon />}
                                        onClick={() => {
                                            setForm(formFromRow(drawer.lead));
                                            setFormError(null);
                                            setDrawer({ mode: 'edit', lead: drawer.lead });
                                        }}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        component={NextLink}
                                        href={`/towers/${drawer.lead.towerId}`}
                                        variant="contained"
                                        endIcon={<OpenInNewIcon fontSize="small" />}
                                        fullWidth
                                    >
                                        Open tower #{drawer.lead.towerId}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={closeDrawer} disabled={saving} color="inherit">
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="contained"
                                        fullWidth
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                                    >
                                        {drawer.mode === 'create' ? 'Create lead' : 'Save changes'}
                                    </Button>
                                </>
                            )}
                        </Box>
                    </Box>
                )}
            </Drawer>

            <Dialog
                open={stageDialogOpen}
                onClose={() => { if (!stageSaving) setStageDialogOpen(false); }}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>New stage</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Custom stages become shared tabs for every lead.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Stage name"
                        value={stageName}
                        onChange={(event) => { setStageName(event.target.value); setStageError(null); }}
                        error={Boolean(stageError)}
                        helperText={stageError ?? 'Example: Staging'}
                        slotProps={{ htmlInput: { maxLength: 40 } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStageDialogOpen(false)} disabled={stageSaving} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={createStage} variant="contained" disabled={stageSaving} startIcon={stageSaving ? <CircularProgress size={16} color="inherit" /> : undefined}>
                        {stageSaving ? 'Creating...' : 'Create stage'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={stageEditOpen}
                onClose={() => { if (!stageEditSaving) setStageEditOpen(false); }}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Edit stage</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Stage name"
                        value={stageEditLabel}
                        onChange={(event) => {
                            setStageEditLabel(event.target.value);
                            setStageEditError(null);
                        }}
                        error={Boolean(stageEditError)}
                        helperText={stageEditError ?? undefined}
                        slotProps={{ htmlInput: { maxLength: 40 } }}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStageEditOpen(false)} disabled={stageEditSaving} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={saveStageEdit} variant="contained" disabled={stageEditSaving}>
                        {stageEditSaving ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default function LeadsPage() {
    return (
        <Suspense
            fallback={
                <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress />
                </Box>
            }
        >
            <LeadsContent />
        </Suspense>
    );
}
