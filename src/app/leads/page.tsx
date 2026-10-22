'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
const PAGE_SIZE = 50;

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

function LeadsContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeStage = (searchParams.get('stage') || '') as LeadStage | '';
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    const [rows, setRows] = useState<LeadRow[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Partial<Record<LeadStage, number>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const [selected, setSelected] = useState<LeadRow | null>(null);

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

    const selectStage = (stage: LeadStage | '') => {
        setPage(0);
        setSelected(null);
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

    const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const end = Math.min((page + 1) * PAGE_SIZE, total);
    const hasFilters = Boolean(search || activeStage);

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 2, p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                        Leads
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {allCount} leads from the CellWaves outreach workbook, across all four tabs.
                    </Typography>
                </Box>
                <Box component="form" onSubmit={submitSearch} sx={{ ml: 'auto', width: { xs: '100%', sm: 340 } }}>
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
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                    label={`All ${allCount}`}
                    onClick={() => selectStage('')}
                    color={activeStage ? 'default' : 'primary'}
                    variant={activeStage ? 'outlined' : 'filled'}
                />
                {STAGES.map((stage) => (
                    <Chip
                        key={stage}
                        label={`${LEAD_STAGE_LABELS[stage]} ${counts[stage] ?? 0}`}
                        onClick={() => selectStage(stage)}
                        color={activeStage === stage ? 'primary' : 'default'}
                        variant={activeStage === stage ? 'filled' : 'outlined'}
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
                            {hasFilters && (
                                <Button variant="outlined" onClick={clearFilters}>
                                    Clear filters
                                </Button>
                            )}
                        </Box>
                    )}

                    {!error && rows.map((row) => (
                        <Box
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelected(row)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelected(row);
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
                                <Chip label={LEAD_STAGE_LABELS[row.stage]} size="small" variant="outlined" />
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
                open={selected !== null}
                onClose={() => setSelected(null)}
                transitionDuration={reduceMotion ? 0 : 200}
                slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 } } } }}
            >
                {selected && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography component="h2" variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                                        {selected.contactPerson || 'No contact name'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {selected.companyName || 'No company on file'}
                                    </Typography>
                                </Box>
                                <IconButton size="small" aria-label="Close lead details" onClick={() => setSelected(null)}>
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                                <Chip label={LEAD_STAGE_LABELS[selected.stage]} size="small" variant="outlined" />
                                {selected.emailFollowUp && <Chip label="Email follow-up" size="small" variant="outlined" />}
                                {selected.brettStatus && <Chip label={selected.brettStatus} size="small" variant="outlined" />}
                            </Box>
                        </Box>

                        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
                            <Box sx={{ display: 'grid', gap: 2.5 }}>
                                <Box>
                                    <Typography sx={sectionLabel}>Actions</Typography>
                                    <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                        {selected.actions || 'No action logged.'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography sx={sectionLabel}>Remarks</Typography>
                                    <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                        {selected.remarks || 'No remarks.'}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box>
                                    <Typography sx={sectionLabel}>Property owner</Typography>
                                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                                        {selected.ownerName || 'No owner record on file.'}
                                    </Typography>
                                    {selected.ownerPhone && (
                                        <Typography variant="body2" color="text.secondary">
                                            {selected.ownerPhone}
                                        </Typography>
                                    )}
                                </Box>
                                <Box>
                                    <Typography sx={sectionLabel}>Location</Typography>
                                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                                        {selected.address || 'No address on file.'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {[selected.city, selected.state].filter(Boolean).join(', ') || 'No city on file.'}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>

                        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                            <Button
                                component={NextLink}
                                href={`/towers/${selected.towerId}`}
                                variant="contained"
                                endIcon={<OpenInNewIcon fontSize="small" />}
                                fullWidth
                            >
                                Open tower #{selected.towerId}
                            </Button>
                        </Box>
                    </Box>
                )}
            </Drawer>
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
