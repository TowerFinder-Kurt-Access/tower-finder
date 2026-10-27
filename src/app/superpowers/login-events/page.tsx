'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { keyframes } from '@emotion/react';
import { useSession } from 'next-auth/react';
import { Role, type LoginEventType } from '@prisma/client';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AndroidIcon from '@mui/icons-material/Android';
import AppleIcon from '@mui/icons-material/Apple';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import TerminalIcon from '@mui/icons-material/Terminal';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import {
    FAMILY_COLOR,
    LOGIN_EVENT_FAMILIES,
    TONE_STYLES,
    metaFor,
    type LoginEventFamily,
    type LoginEventTone,
} from '@/lib/login-event-labels';
import { BROWSER_LOGO_PATH } from '@/lib/browser-logos';
import { countryFlag, countryName } from '@/lib/country-flag';

const DISPLAY_FONT = '"Outfit", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

const C = {
    bg: '#0a0a0a',
    panel: '#111111',
    panelRaised: '#151515',
    panelInset: '#0d0d0d',
    border: '#262626',
    borderSoft: '#1c1c1c',
    text: '#f5f5f5',
    body: '#d4d4d4',
    muted: '#9ca3af',
    dim: '#6b7280',
    faint: '#525252',
    accent: '#3b82f6',
} as const;

const PAGE_SIZES = [25, 50, 100] as const;

type AgentBrowser =
    | 'Chrome'
    | 'Firefox'
    | 'Safari'
    | 'Edge'
    | 'Opera'
    | 'curl'
    | 'axios'
    | 'Other'
    | 'Not recorded';

type AgentOs = 'Windows' | 'macOS' | 'Android' | 'iOS' | 'Linux' | 'Unknown OS';

const OS_ICON: Record<AgentOs, typeof DesktopWindowsIcon> = {
    Windows: DesktopWindowsIcon,
    macOS: AppleIcon,
    iOS: PhoneIphoneIcon,
    Android: AndroidIcon,
    Linux: TerminalIcon,
    'Unknown OS': DevicesOtherIcon,
};

/** Official Simple Icons brand colors. curl is lightened for a dark surface. */
const BROWSER_COLOR: Record<AgentBrowser, string> = {
    Chrome: '#4285F4',
    Firefox: '#FF7139',
    Safari: '#006CFF',
    Edge: '#0F7DC2',
    Opera: '#FF1B2D',
    curl: '#7FA8C9',
    axios: '#5A29E4',
    Other: '#94A3B8',
    'Not recorded': '#4B5563',
};

const rise = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
`;

/** Staggered entrance for the summary cards. Honors reduced-motion. */
function revealSx(index: number) {
    return {
        animation: `${rise} 520ms cubic-bezier(0.22, 1, 0.36, 1) both`,
        animationDelay: `${index * 70}ms`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
    };
}

interface LoginEventRow {
    id: number;
    email: string;
    userId: number | null;
    type: LoginEventType;
    ip: string | null;
    country: string | null;
    userAgent: string | null;
    metadata: unknown;
    createdAt: string;
    user: { id: number; name: string; email: string } | null;
}

interface LoginEventResponse {
    rows: LoginEventRow[];
    total: number;
    page: number;
    pageSize: number;
    byType: Record<string, number>;
}

interface Filters {
    email: string;
    ip: string;
    types: LoginEventType[];
    from: string;
    to: string;
}

const EMPTY_FILTERS: Filters = { email: '', ip: '', types: [], from: '', to: '' };

function formatStamp(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function formatRelative(iso: string): string {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.round(days / 30)}mo ago`;
}

function describeAgent(userAgent: string | null): { browser: AgentBrowser; os: AgentOs } {
    if (!userAgent) return { browser: 'Not recorded', os: 'Unknown OS' };

    // Order matters. Edge and Opera both ship "Chrome/", and every Chrome UA
    // carries "Safari/". Mobile UAs carry "Mac OS X" or "Linux" too.
    let browser: AgentBrowser = 'Other';
    if (/Edg\//.test(userAgent)) browser = 'Edge';
    else if (/OPR\//.test(userAgent)) browser = 'Opera';
    else if (/Firefox\//.test(userAgent)) browser = 'Firefox';
    else if (/Chrome\//.test(userAgent)) browser = 'Chrome';
    else if (/Safari\//.test(userAgent)) browser = 'Safari';
    else if (/curl\//.test(userAgent)) browser = 'curl';
    else if (/axios\//.test(userAgent)) browser = 'axios';

    let os: AgentOs = 'Unknown OS';
    if (/Android/.test(userAgent)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(userAgent)) os = 'iOS';
    else if (/Windows NT/.test(userAgent)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(userAgent)) os = 'macOS';
    else if (/Linux|X11/.test(userAgent)) os = 'Linux';

    return { browser, os };
}

function formatMetadata(metadata: unknown): string {
    if (metadata === null || metadata === undefined) return 'No metadata recorded for this event.';
    try {
        return JSON.stringify(metadata, null, 2);
    } catch {
        return 'Metadata could not be serialized.';
    }
}

function share(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
}

export default function LoginEventsPage() {
    const { data: session, status } = useSession();

    const [rows, setRows] = useState<LoginEventRow[]>([]);
    const [total, setTotal] = useState(0);
    const [byType, setByType] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [debouncedFilters, setDebouncedFilters] = useState<Filters>(EMPTY_FILTERS);
    const [openFamily, setOpenFamily] = useState<LoginEventFamily | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(25);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const requestRef = useRef(0);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedFilters(filters), 300);
        return () => clearTimeout(timer);
    }, [filters]);

    const requestEvents = useCallback((fresh: boolean) => {
        const params: Record<string, string | number> = { page, pageSize };
        if (debouncedFilters.email.trim()) params.email = debouncedFilters.email.trim();
        if (debouncedFilters.ip.trim()) params.ip = debouncedFilters.ip.trim();
        if (debouncedFilters.types.length > 0) params.type = debouncedFilters.types.join(',');
        if (debouncedFilters.from) params.from = `${debouncedFilters.from}T00:00:00`;
        if (debouncedFilters.to) params.to = `${debouncedFilters.to}T23:59:59.999`;
        // Refresh skips the server cache, so it always reads the current table.
        if (fresh) params.fresh = 1;
        return axios.get<LoginEventResponse>('/api/admin/login-events', { params });
    }, [debouncedFilters, page, pageSize]);

    const commit = useCallback((data: LoginEventResponse) => {
        setRows(data.rows);
        setTotal(data.total);
        setByType(data.byType);
    }, []);

    // The newest request wins. Older responses land late and are dropped.
    const runRequest = useCallback((fresh = false) => {
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;

        return requestEvents(fresh)
            .then((response) => {
                if (requestRef.current !== requestId) return;
                commit(response.data);
                setError('');
            })
            .catch((requestError: unknown) => {
                if (requestRef.current !== requestId) return;
                const message = axios.isAxiosError(requestError)
                    ? (requestError.response?.data as { error?: string } | undefined)?.error
                    : undefined;
                setError(message ?? 'Failed to load login events.');
            })
            .finally(() => {
                if (requestRef.current === requestId) setLoading(false);
            });
    }, [requestEvents, commit]);

    useEffect(() => {
        if (session?.user?.role !== Role.ADMIN) return;
        void runRequest();
    }, [runRequest, session?.user?.role]);

    const updateFilters = useCallback((patch: Partial<Filters>) => {
        setLoading(true);
        setFilters((current) => ({ ...current, ...patch }));
        setPage(1);
        setExpandedId(null);
    }, []);

    const toggleType = useCallback((type: LoginEventType) => {
        setLoading(true);
        setFilters((current) => ({
            ...current,
            types: current.types.includes(type)
                ? current.types.filter((value) => value !== type)
                : [...current.types, type],
        }));
        setPage(1);
        setExpandedId(null);
    }, []);

    const clearFilters = useCallback(() => {
        setLoading(true);
        // A fresh object keeps the debounce effect firing even when nothing changes.
        setFilters((current) => ({ ...current, ...EMPTY_FILTERS }));
        setPage(1);
        setExpandedId(null);
    }, []);

    const familyCounts = useMemo(() => {
        const counts: Record<LoginEventFamily, number> = { session: 0, account: 0, password: 0, otp: 0 };
        for (const family of LOGIN_EVENT_FAMILIES) {
            counts[family.key] = family.types.reduce((sum, type) => sum + (byType[type] ?? 0), 0);
        }
        return counts;
    }, [byType]);

    const successCount = byType.LOGIN_SUCCESS ?? 0;
    const failedCount = byType.LOGIN_FAILED ?? 0;
    const lockedCount = byType.LOGIN_LOCKED ?? 0;
    const otpCount = familyCounts.otp;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const rangeEnd = Math.min(page * pageSize, total);
    const activeFilterCount =
        filters.types.length +
        (filters.email.trim() ? 1 : 0) +
        (filters.ip.trim() ? 1 : 0) +
        (filters.from ? 1 : 0) +
        (filters.to ? 1 : 0);

    const tiles: ReadonlyArray<{ label: string; value: number; caption: string; tone: LoginEventTone }> = [
        { label: 'Successful logins', value: successCount, caption: 'LOGIN_SUCCESS', tone: 'success' },
        { label: 'Failed attempts', value: failedCount, caption: 'LOGIN_FAILED', tone: 'failure' },
        { label: 'Lockouts', value: lockedCount, caption: 'LOGIN_LOCKED', tone: 'warning' },
        { label: 'One-time codes', value: otpCount, caption: 'OTP_* events', tone: 'info' },
    ];

    if (status === 'loading') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <CircularProgress size={28} sx={{ color: C.accent }} />
            </Box>
        );
    }

    if (session?.user?.role !== Role.ADMIN) {
        return (
            <Box sx={{ p: 4 }}>
                <Alert severity="error">Access Denied. Admin privileges required.</Alert>
            </Box>
        );
    }

    return (
        <Box
            component="main"
            sx={{
                width: '100%',
                maxWidth: '100%',
                // `clip` (not `hidden`) keeps the sticky filter rail working.
                overflowX: 'clip',
                bgcolor: C.bg,
                color: C.text,
                pb: { xs: 6, md: 10 },
            }}
        >
            <link
                rel="stylesheet"
                href="https://api.fonts.coollabs.io/css2?family=Outfit:wght@400;500;600;700&display=swap"
                precedence="default"
            />

            <Box
                component="header"
                sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    px: { xs: 2.5, md: 6 },
                    pt: { xs: 5, md: 9 },
                    pb: { xs: 5, md: 8 },
                    textAlign: 'center',
                }}
            >
                <Box
                    aria-hidden
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background:
                            'radial-gradient(780px 380px at 50% -12%, rgba(59, 130, 246, 0.20), transparent 70%), ' +
                            'radial-gradient(560px 320px at 88% 8%, rgba(16, 185, 129, 0.10), transparent 72%), ' +
                            'radial-gradient(460px 280px at 8% 22%, rgba(167, 139, 250, 0.10), transparent 72%)',
                    }}
                />

                <Box sx={{ position: 'relative', maxWidth: 1280, mx: 'auto' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: { xs: 4, md: 6 } }}>
                        <Box
                            component={Link}
                            href="/superpowers"
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                color: C.dim,
                                textDecoration: 'none',
                                fontSize: '0.8125rem',
                                fontWeight: 500,
                                transition: 'color 180ms ease',
                                '&:hover': { color: C.text },
                            }}
                        >
                            <ArrowBackIcon sx={{ fontSize: 15 }} />
                            Superpowers
                        </Box>
                    </Box>

                    <Typography
                        component="h1"
                        sx={{
                            maxWidth: 1120,
                            mx: 'auto',
                            fontFamily: DISPLAY_FONT,
                            fontSize: 'clamp(2.25rem, 5vw, 3.75rem)',
                            fontWeight: 600,
                            lineHeight: 1.06,
                            letterSpacing: '-0.035em',
                            color: C.text,
                        }}
                    >
                        Every sign-in, every failure, on the record.
                    </Typography>

                    <Typography
                        sx={{
                            mt: { xs: 2.5, md: 3 },
                            mx: 'auto',
                            maxWidth: '68ch',
                            fontSize: { xs: '0.9375rem', md: '1.0625rem' },
                            lineHeight: 1.6,
                            color: C.muted,
                        }}
                    >
                        Nineteen event types across session, account, password, and one-time code. Each row keeps the
                        email, the IP, the device, and the metadata the server recorded.
                    </Typography>

                    <Box sx={{ mt: { xs: 4, md: 5 }, display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Button
                            onClick={() => {
                                setLoading(true);
                                void runRequest(true);
                            }}
                            startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
                            sx={{
                                bgcolor: C.text,
                                color: C.bg,
                                fontWeight: 600,
                                px: 3,
                                height: 44,
                                borderRadius: '10px',
                                '&:hover': { bgcolor: '#ffffff' },
                            }}
                        >
                            Refresh
                        </Button>
                        <Button
                            onClick={clearFilters}
                            disabled={activeFilterCount === 0}
                            sx={{
                                color: C.body,
                                border: `1px solid ${C.border}`,
                                px: 3,
                                height: 44,
                                borderRadius: '10px',
                                '&:hover': { borderColor: '#4a4a4a', bgcolor: C.panelRaised },
                                '&.Mui-disabled': { color: C.faint, borderColor: C.borderSoft },
                            }}
                        >
                            Clear filters
                        </Button>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2.5, md: 6 } }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(12, minmax(0, 1fr))' },
                        gridAutoFlow: 'dense',
                        gap: { xs: 1.5, md: 2 },
                    }}
                >
                    <Box
                        sx={{
                            ...revealSx(0),
                            gridColumn: { xs: 'span 1', sm: 'span 2', md: 'span 4' },
                            gridRow: { md: 'span 2' },
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 3,
                            minHeight: { xs: 210, md: 268 },
                            p: { xs: 2.5, md: 3 },
                            bgcolor: C.panel,
                            border: `1px solid ${C.border}`,
                            borderRadius: '16px',
                        }}
                    >
                        <Box>
                            <Typography
                                sx={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.14em',
                                    textTransform: 'uppercase',
                                    color: C.dim,
                                }}
                            >
                                Total events
                            </Typography>
                            <Typography
                                sx={{
                                    mt: 1.5,
                                    fontFamily: DISPLAY_FONT,
                                    fontSize: 'clamp(2.75rem, 6vw, 3.75rem)',
                                    fontWeight: 600,
                                    lineHeight: 1,
                                    letterSpacing: '-0.04em',
                                    color: C.text,
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            >
                                {total.toLocaleString()}
                            </Typography>
                            <Typography sx={{ mt: 1, fontSize: '0.8125rem', color: C.muted }}>
                                {activeFilterCount > 0 ? 'Matching the current filters' : 'Whole table, newest first'}
                            </Typography>
                        </Box>

                        <Box>
                            <Box
                                sx={{
                                    display: 'flex',
                                    height: 6,
                                    gap: '2px',
                                    borderRadius: '99px',
                                    overflow: 'hidden',
                                    bgcolor: '#1f1f1f',
                                }}
                            >
                                {LOGIN_EVENT_FAMILIES.map((family) => (
                                    <Box
                                        key={family.key}
                                        sx={{
                                            width: `${share(familyCounts[family.key], total)}%`,
                                            bgcolor: FAMILY_COLOR[family.key],
                                            transition: 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
                                        }}
                                    />
                                ))}
                            </Box>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.75, mt: 2 }}>
                                {LOGIN_EVENT_FAMILIES.map((family) => (
                                    <Box key={family.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Box
                                            sx={{
                                                width: 6,
                                                height: 6,
                                                borderRadius: '50%',
                                                bgcolor: FAMILY_COLOR[family.key],
                                            }}
                                        />
                                        <Typography sx={{ fontSize: '0.75rem', color: C.muted }}>
                                            {family.label}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color: C.body,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}
                                        >
                                            {familyCounts[family.key].toLocaleString()}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>

                    {tiles.map((tile, index) => {
                        const tone = TONE_STYLES[tile.tone];
                        return (
                            <Box
                                key={tile.label}
                                sx={{
                                    ...revealSx(index + 1),
                                    gridColumn: { md: 'span 4' },
                                    p: { xs: 2.25, md: 2.75 },
                                    bgcolor: C.panel,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: '16px',
                                    transition: 'border-color 220ms ease, background-color 220ms ease',
                                    '&:hover': { borderColor: '#3a3a3a', bgcolor: C.panelRaised },
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tone.fg }} />
                                    <Typography
                                        sx={{
                                            fontSize: '0.6875rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.14em',
                                            textTransform: 'uppercase',
                                            color: C.dim,
                                        }}
                                    >
                                        {tile.label}
                                    </Typography>
                                </Box>
                                <Typography
                                    sx={{
                                        mt: 1.5,
                                        fontFamily: DISPLAY_FONT,
                                        fontSize: 'clamp(1.75rem, 3vw, 2.25rem)',
                                        fontWeight: 600,
                                        lineHeight: 1,
                                        letterSpacing: '-0.03em',
                                        color: C.text,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}
                                >
                                    {tile.value.toLocaleString()}
                                </Typography>
                                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                    <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.6875rem', color: C.faint }}>
                                        {tile.caption}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tone.fg }}>
                                        {share(tile.value, total)}%
                                    </Typography>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>

                <Box
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        mt: { xs: 3, md: 4 },
                        mx: { xs: -2.5, md: -6 },
                        px: { xs: 2.5, md: 6 },
                        py: { xs: 2, md: 2.5 },
                        bgcolor: 'rgba(10, 10, 10, 0.90)',
                        backdropFilter: 'blur(16px)',
                        borderTop: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.border}`,
                    }}
                >
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: '1.4fr 1fr 1fr 1fr' },
                            gap: 1.5,
                            alignItems: 'end',
                        }}
                    >
                        <Field label="Email">
                            <TextField
                                size="small"
                                fullWidth
                                placeholder="caller@example.com"
                                value={filters.email}
                                onChange={(event) => updateFilters({ email: event.target.value })}
                                sx={INPUT_SX}
                            />
                        </Field>
                        <Field label="IP address">
                            <TextField
                                size="small"
                                fullWidth
                                placeholder="203.0.113."
                                value={filters.ip}
                                onChange={(event) => updateFilters({ ip: event.target.value })}
                                sx={INPUT_SX}
                            />
                        </Field>
                        <Field label="From">
                            <TextField
                                size="small"
                                fullWidth
                                type="date"
                                value={filters.from}
                                onChange={(event) => updateFilters({ from: event.target.value })}
                                sx={INPUT_SX}
                            />
                        </Field>
                        <Field label="To">
                            <TextField
                                size="small"
                                fullWidth
                                type="date"
                                value={filters.to}
                                onChange={(event) => updateFilters({ to: event.target.value })}
                                sx={INPUT_SX}
                            />
                        </Field>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1, mt: 2 }}>
                        {LOGIN_EVENT_FAMILIES.map((family) => {
                            const open = openFamily === family.key;
                            const selectedCount = family.types.filter((type) => filters.types.includes(type)).length;
                            const familyTotal = family.types.reduce((sum, type) => sum + (byType[type] ?? 0), 0);

                            return (
                                <Box
                                    key={family.key}
                                    sx={{
                                        flex: { md: open ? '1 1 0%' : '0 0 176px' },
                                        minWidth: 0,
                                        border: '1px solid',
                                        borderColor: open ? C.accent : C.border,
                                        bgcolor: open ? C.panelRaised : '#0f0f0f',
                                        borderRadius: '12px',
                                        px: 1.5,
                                        py: 1.25,
                                        transition: 'flex-grow 320ms cubic-bezier(0.22, 1, 0.36, 1), border-color 200ms ease, background-color 200ms ease',
                                    }}
                                >
                                    <Box
                                        component="button"
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setOpenFamily(open ? null : family.key)}
                                        sx={{
                                            display: 'flex',
                                            width: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 1,
                                            background: 'none',
                                            border: 'none',
                                            p: 0,
                                            cursor: 'pointer',
                                            color: 'inherit',
                                            font: 'inherit',
                                            '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: 2 },
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                fontFamily: DISPLAY_FONT,
                                                fontSize: '0.8125rem',
                                                fontWeight: 600,
                                                color: C.text,
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {family.label}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                            {selectedCount > 0 && (
                                                <Box
                                                    sx={{
                                                        minWidth: 18,
                                                        height: 18,
                                                        px: 0.5,
                                                        borderRadius: '99px',
                                                        bgcolor: C.accent,
                                                        color: '#ffffff',
                                                        fontSize: '0.625rem',
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    {selectedCount}
                                                </Box>
                                            )}
                                            <Typography
                                                sx={{
                                                    fontSize: '0.6875rem',
                                                    color: C.faint,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}
                                            >
                                                {familyTotal.toLocaleString()}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    {open && (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.25 }}>
                                            {family.types.map((type) => {
                                                const meta = metaFor(type);
                                                const tone = TONE_STYLES[meta.tone];
                                                const active = filters.types.includes(type);

                                                return (
                                                    <Box
                                                        key={type}
                                                        component="button"
                                                        type="button"
                                                        aria-pressed={active}
                                                        onClick={() => toggleType(type)}
                                                        sx={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 0.6,
                                                            px: 1,
                                                            height: 24,
                                                            borderRadius: '6px',
                                                            border: '1px solid',
                                                            borderColor: active ? tone.border : '#2a2a2a',
                                                            bgcolor: active ? tone.bg : 'transparent',
                                                            color: active ? tone.fg : '#8b8b8b',
                                                            fontSize: '0.6875rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap',
                                                            transition: 'all 160ms ease',
                                                            '&:hover': { borderColor: tone.border, color: tone.fg },
                                                            '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: 1 },
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                width: 5,
                                                                height: 5,
                                                                borderRadius: '50%',
                                                                bgcolor: active ? tone.fg : '#4b5563',
                                                            }}
                                                        />
                                                        {meta.label}
                                                    </Box>
                                                );
                                            })}
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>

                    {loading && (
                        <LinearProgress
                            sx={{
                                mt: 1.5,
                                height: 2,
                                borderRadius: 99,
                                bgcolor: 'transparent',
                                '& .MuiLinearProgress-bar': { bgcolor: C.accent },
                            }}
                        />
                    )}
                </Box>

                <Box component="section" sx={{ mt: { xs: 4, md: 5 } }}>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            flexWrap: 'wrap',
                            gap: 2,
                            mb: 2.5,
                        }}
                    >
                        <Box>
                            <Typography
                                component="h2"
                                sx={{
                                    fontFamily: DISPLAY_FONT,
                                    fontSize: { xs: '1.5rem', md: '2rem' },
                                    fontWeight: 600,
                                    letterSpacing: '-0.025em',
                                    color: C.text,
                                }}
                            >
                                Event stream
                            </Typography>
                            <Typography sx={{ mt: 0.5, fontSize: '0.8125rem', color: C.muted }}>
                                {total.toLocaleString()} {total === 1 ? 'row' : 'rows'} match the current filters.
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.75rem', color: C.dim }}>Rows</Typography>
                            <Select
                                value={pageSize}
                                onChange={(event) => {
                                    setLoading(true);
                                    setPageSize(Number(event.target.value));
                                    setPage(1);
                                }}
                                size="small"
                                sx={{
                                    height: 32,
                                    fontSize: '0.8125rem',
                                    color: C.body,
                                    bgcolor: C.panelRaised,
                                    borderRadius: '8px',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2a2a' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3a3a3a' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.accent },
                                    '& .MuiSvgIcon-root': { color: C.dim, fontSize: 18 },
                                }}
                            >
                                {PAGE_SIZES.map((size) => (
                                    <MenuItem key={size} value={size} sx={{ fontSize: '0.8125rem' }}>
                                        {size}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                    </Box>

                    {error && (
                        <Alert
                            severity="error"
                            onClose={() => setError('')}
                            sx={{
                                mb: 2,
                                bgcolor: 'rgba(251, 113, 133, 0.08)',
                                color: '#fecdd3',
                                border: '1px solid rgba(251, 113, 133, 0.32)',
                                '& .MuiAlert-icon': { color: '#fb7185' },
                            }}
                        >
                            {error}
                        </Alert>
                    )}

                    <TableContainer
                        sx={{
                            bgcolor: C.panel,
                            border: `1px solid ${C.border}`,
                            borderRadius: '16px',
                            overflowX: 'auto',
                            overflowY: 'hidden',
                        }}
                    >
                        <Table size="small" sx={{ minWidth: 960 }}>
                            <TableHead>
                                <TableRow>
                                    {['Recorded', 'Event', 'Email', 'Account', 'IP', 'Device', ''].map((heading, index) => (
                                        <TableCell
                                            key={heading || 'expand'}
                                            align={index === 6 ? 'right' : 'left'}
                                            sx={{
                                                bgcolor: C.panelRaised,
                                                borderBottom: `1px solid ${C.border}`,
                                                color: C.dim,
                                                fontSize: '0.6875rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.12em',
                                                textTransform: 'uppercase',
                                                py: 1.4,
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {heading}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((row) => {
                                    const meta = metaFor(row.type);
                                    const tone = TONE_STYLES[meta.tone];
                                    const agent = describeAgent(row.userAgent);
                                    const expanded = expandedId === row.id;

                                    return (
                                        <Fragment key={row.id}>
                                            <TableRow
                                                onClick={() => setExpandedId(expanded ? null : row.id)}
                                                sx={{
                                                    cursor: 'pointer',
                                                    transition: 'background-color 160ms ease',
                                                    '&:hover': { bgcolor: '#161616' },
                                                    '& td': { borderBottom: `1px solid ${C.borderSoft}` },
                                                }}
                                            >
                                                <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                                                    <Typography sx={{ fontSize: '0.8125rem', color: C.body }}>
                                                        {formatStamp(row.createdAt)}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: '0.6875rem', color: C.faint }}>
                                                        {formatRelative(row.createdAt)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 1.25 }}>
                                                    <Box
                                                        sx={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 0.6,
                                                            px: 1,
                                                            height: 24,
                                                            borderRadius: '6px',
                                                            border: `1px solid ${tone.border}`,
                                                            bgcolor: tone.bg,
                                                            color: tone.fg,
                                                            fontSize: '0.6875rem',
                                                            fontWeight: 600,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                width: 5,
                                                                height: 5,
                                                                borderRadius: '50%',
                                                                bgcolor: tone.fg,
                                                            }}
                                                        />
                                                        {meta.label}
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ py: 1.25 }}>
                                                    <Typography
                                                        sx={{
                                                            fontFamily: MONO_FONT,
                                                            fontSize: '0.8125rem',
                                                            color: C.body,
                                                            maxWidth: 220,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                        title={row.email}
                                                    >
                                                        {row.email}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                                                    {row.user ? (
                                                        <Box
                                                            component={Link}
                                                            href={`/superpowers/users/${row.user.id}`}
                                                            onClick={(event) => event.stopPropagation()}
                                                            sx={{
                                                                fontSize: '0.8125rem',
                                                                color: C.body,
                                                                textDecoration: 'none',
                                                                borderBottom: '1px solid #3a3a3a',
                                                                transition: 'color 160ms ease, border-color 160ms ease',
                                                                '&:hover': { color: C.accent, borderColor: C.accent },
                                                            }}
                                                        >
                                                            {row.user.name || row.user.email}
                                                        </Box>
                                                    ) : (
                                                        <Typography sx={{ fontSize: '0.8125rem', color: C.faint }}>
                                                            {row.userId === null ? 'Not linked' : `#${row.userId}`}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                        {row.country ? (
                                                            <Box
                                                                component="span"
                                                                role="img"
                                                                aria-label={countryName(row.country)}
                                                                title={countryName(row.country)}
                                                                sx={{
                                                                    fontSize: '0.9375rem',
                                                                    lineHeight: 1,
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {countryFlag(row.country)}
                                                            </Box>
                                                        ) : (
                                                            <Box
                                                                aria-hidden
                                                                sx={{
                                                                    width: 15,
                                                                    height: 15,
                                                                    flexShrink: 0,
                                                                    borderRadius: '3px',
                                                                    bgcolor: '#1c1c1c',
                                                                }}
                                                            />
                                                        )}
                                                        <Typography
                                                            sx={{
                                                                fontFamily: MONO_FONT,
                                                                fontSize: '0.8125rem',
                                                                color: C.body,
                                                            }}
                                                        >
                                                            {row.ip ?? 'Not recorded'}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ py: 1.25, whiteSpace: 'nowrap' }}>
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                            <BrowserBadge browser={agent.browser} />
                                                            <Typography sx={{ fontSize: '0.8125rem', color: C.body, lineHeight: 1.2 }}>
                                                                {agent.browser}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                            <OsGlyph os={agent.os} />
                                                            <Typography sx={{ fontSize: '0.6875rem', color: C.faint, lineHeight: 1.2 }}>
                                                                {agent.os}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                </TableCell>
                                                <TableCell align="right" sx={{ py: 1.25 }}>
                                                    <IconButton
                                                        size="small"
                                                        aria-label={expanded ? 'Hide event details' : 'Show event details'}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setExpandedId(expanded ? null : row.id);
                                                        }}
                                                        sx={{
                                                            color: C.dim,
                                                            transform: expanded ? 'rotate(180deg)' : 'none',
                                                            transition: 'transform 200ms ease, color 160ms ease',
                                                            '&:hover': { color: C.text },
                                                        }}
                                                    >
                                                        <ExpandMoreIcon sx={{ fontSize: 18 }} />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>

                                            {expanded && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={7}
                                                        sx={{
                                                            p: 0,
                                                            borderBottom: `1px solid ${C.border}`,
                                                            bgcolor: C.panelInset,
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                display: 'grid',
                                                                gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
                                                                gap: { xs: 2, md: 3 },
                                                                p: { xs: 2, md: 2.5 },
                                                            }}
                                                        >
                                                            <Box>
                                                                <Typography sx={DETAIL_LABEL_SX}>Metadata</Typography>
                                                                <Box
                                                                    component="pre"
                                                                    sx={{
                                                                        m: 0,
                                                                        p: 1.75,
                                                                        bgcolor: '#080808',
                                                                        border: `1px solid ${C.borderSoft}`,
                                                                        borderRadius: '10px',
                                                                        fontFamily: MONO_FONT,
                                                                        fontSize: '0.75rem',
                                                                        lineHeight: 1.6,
                                                                        color: '#a3a3a3',
                                                                        whiteSpace: 'pre-wrap',
                                                                        wordBreak: 'break-word',
                                                                        maxHeight: 240,
                                                                        overflowY: 'auto',
                                                                    }}
                                                                >
                                                                    {formatMetadata(row.metadata)}
                                                                </Box>
                                                            </Box>

                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                                                <DetailRow label="Event ID" value={`#${row.id}`} mono />
                                                                <DetailRow label="Enum value" value={row.type} mono />
                                                                <DetailRow
                                                                    label="Account ID"
                                                                    value={row.userId === null ? 'Not linked' : `#${row.userId}`}
                                                                    mono
                                                                />
                                                                <DetailRow
                                                                    label="Country"
                                                                    value={
                                                                        row.country
                                                                            ? `${countryName(row.country)} (${row.country})`
                                                                            : 'Not resolved'
                                                                    }
                                                                />
                                                                <DetailRow
                                                                    label="Recorded"
                                                                    value={new Date(row.createdAt).toLocaleString('en-US', {
                                                                        dateStyle: 'full',
                                                                        timeStyle: 'long',
                                                                    })}
                                                                />
                                                                <DetailRow
                                                                    label="User agent"
                                                                    value={row.userAgent ?? 'Not recorded'}
                                                                    mono
                                                                />
                                                            </Box>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </Fragment>
                                    );
                                })}

                                {!loading && rows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} sx={{ borderBottom: 'none', py: 8 }}>
                                            <Box sx={{ textAlign: 'center' }}>
                                                <SearchOffIcon sx={{ fontSize: 32, color: C.faint }} />
                                                <Typography
                                                    sx={{
                                                        mt: 1.5,
                                                        fontFamily: DISPLAY_FONT,
                                                        fontSize: '1.0625rem',
                                                        fontWeight: 600,
                                                        color: C.body,
                                                    }}
                                                >
                                                    No events match these filters.
                                                </Typography>
                                                <Typography sx={{ mt: 0.5, fontSize: '0.8125rem', color: C.dim }}>
                                                    Widen the date range or clear a filter.
                                                </Typography>
                                                <Button
                                                    onClick={clearFilters}
                                                    sx={{
                                                        mt: 2,
                                                        color: C.body,
                                                        border: `1px solid ${C.border}`,
                                                        borderRadius: '10px',
                                                        px: 2.5,
                                                        '&:hover': { borderColor: '#4a4a4a', bgcolor: C.panelRaised },
                                                    }}
                                                >
                                                    Clear filters
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {loading && rows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} sx={{ borderBottom: 'none', py: 8 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                                <CircularProgress size={24} sx={{ color: C.accent }} />
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 2,
                            mt: 2,
                        }}
                    >
                        <Typography sx={{ fontSize: '0.8125rem', color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                            {rangeStart.toLocaleString()}&ndash;{rangeEnd.toLocaleString()} of {total.toLocaleString()}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <IconButton
                                size="small"
                                aria-label="Previous page"
                                disabled={page <= 1}
                                onClick={() => {
                                    setLoading(true);
                                    setPage((current) => Math.max(1, current - 1));
                                }}
                                sx={{
                                    color: C.body,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: '8px',
                                    '&:hover': { borderColor: '#4a4a4a', bgcolor: C.panelRaised },
                                    '&.Mui-disabled': { color: C.faint, borderColor: C.borderSoft },
                                }}
                            >
                                <ChevronLeftIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <Typography
                                sx={{ fontSize: '0.8125rem', color: C.body, fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'center' }}
                            >
                                {page} / {totalPages}
                            </Typography>
                            <IconButton
                                size="small"
                                aria-label="Next page"
                                disabled={page >= totalPages}
                                onClick={() => {
                                    setLoading(true);
                                    setPage((current) => Math.min(totalPages, current + 1));
                                }}
                                sx={{
                                    color: C.body,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: '8px',
                                    '&:hover': { borderColor: '#4a4a4a', bgcolor: C.panelRaised },
                                    '&.Mui-disabled': { color: C.faint, borderColor: C.borderSoft },
                                }}
                            >
                                <ChevronRightIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Box
                component="footer"
                sx={{
                    mt: { xs: 8, md: 12 },
                    px: { xs: 2.5, md: 6 },
                    py: 4,
                    borderTop: `1px solid ${C.borderSoft}`,
                }}
            >
                <Box
                    sx={{
                        maxWidth: 1280,
                        mx: 'auto',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Typography sx={{ fontSize: '0.75rem', color: C.faint }}>
                        Source: public.LoginEvent. Read only. Nineteen event types.
                    </Typography>
                    <Box
                        component={Link}
                        href="/superpowers"
                        sx={{
                            fontSize: '0.75rem',
                            color: C.dim,
                            textDecoration: 'none',
                            transition: 'color 160ms ease',
                            '&:hover': { color: C.text },
                        }}
                    >
                        Back to Superpowers
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

const INPUT_SX = {
    '& .MuiOutlinedInput-root': {
        bgcolor: '#0f0f0f',
        borderRadius: '10px',
        fontSize: '0.8125rem',
        color: C.body,
        '& fieldset': { borderColor: '#2a2a2a' },
        '&:hover fieldset': { borderColor: '#3a3a3a' },
        '&.Mui-focused fieldset': { borderColor: C.accent, borderWidth: '1px' },
    },
    '& .MuiInputBase-input::placeholder': { color: '#4b5563', opacity: 1 },
    '& input::-webkit-calendar-picker-indicator': { filter: 'invert(0.55)', cursor: 'pointer' },
};

const DETAIL_LABEL_SX = {
    mb: 1,
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: C.dim,
};

function BrowserBadge({ browser }: { browser: AgentBrowser }) {
    const color = BROWSER_COLOR[browser];
    const path = browserLogo(browser);

    if (path) {
        return (
            <Box sx={{ width: 15, height: 15, flexShrink: 0, display: 'flex' }}>
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
                    <path d={path} fill={color} />
                </svg>
            </Box>
        );
    }

    // Edge and unknown agents have no vendored mark, so they keep the badge.
    const initial = browser === 'Not recorded' ? '?' : browser.charAt(0).toUpperCase();

    return (
        <Box
            aria-hidden
            sx={{
                width: 15,
                height: 15,
                flexShrink: 0,
                borderRadius: '4px',
                border: `1px solid ${color}59`,
                bgcolor: `${color}26`,
                color,
                fontSize: '0.5625rem',
                fontWeight: 800,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {initial}
        </Box>
    );
}

/** Narrows to the browsers that ship a vendored mark. */
function browserLogo(browser: AgentBrowser): string | null {
    switch (browser) {
        case 'Chrome':
        case 'Firefox':
        case 'Safari':
        case 'Opera':
        case 'curl':
        case 'axios':
            return BROWSER_LOGO_PATH[browser];
        default:
            return null;
    }
}

function OsGlyph({ os }: { os: AgentOs }) {
    const Icon = OS_ICON[os];
    return <Icon aria-hidden sx={{ fontSize: 15, color: C.dim, flexShrink: 0 }} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography
                sx={{
                    mb: 0.75,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: C.dim,
                }}
            >
                {label}
            </Typography>
            {children}
        </Box>
    );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <Box>
            <Typography
                sx={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: C.faint,
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    mt: 0.25,
                    fontFamily: mono ? MONO_FONT : DISPLAY_FONT,
                    fontSize: '0.75rem',
                    lineHeight: 1.5,
                    color: C.body,
                    wordBreak: 'break-word',
                }}
            >
                {value}
            </Typography>
        </Box>
    );
}
