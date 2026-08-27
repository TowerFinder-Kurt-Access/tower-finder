'use client';

import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import ExploreIcon from '@mui/icons-material/Explore';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import RadarIcon from '@mui/icons-material/Radar';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import { useEffect, useState } from 'react';

type Entry = {
    label: string;
    description: string;
    path: string;
    icon: React.ReactNode;
    span: 'wide' | 'narrow';
};

// Bento order: 1 wide + 4 narrow. Wide leads the eye to the highest-traffic tool.
const ENTRIES: ReadonlyArray<Entry> = [
    {
        label: 'Tower Leads',
        description: 'Search history, imported leads, and promotion to towers.',
        path: '/superpowers/tower-leads',
        icon: <ExploreIcon />,
        span: 'wide',
    },
    {
        label: 'Users',
        description: 'Create, edit, reset, deactivate.',
        path: '/superpowers/users',
        icon: <AdminPanelSettingsIcon />,
        span: 'narrow',
    },
    {
        label: 'Background Jobs',
        description: 'Trigger and retry queued jobs.',
        path: '/superpowers/jobs',
        icon: <AutorenewIcon />,
        span: 'narrow',
    },
    {
        label: 'Discovery Scans',
        description: 'Live progress for running scans.',
        path: '/superpowers/discovery',
        icon: <RadarIcon />,
        span: 'narrow',
    },
    {
        label: 'Lookups',
        description: 'Carriers, types, statuses.',
        path: '/superpowers/lookups',
        icon: <SettingsIcon />,
        span: 'narrow',
    },
] as const;

export default function SuperpowersLanding() {
    const { data: session, status } = useSession();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (status === 'loading') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}>
                <CircularProgress sx={{ color: '#3b82f6' }} />
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
            sx={{
                minHeight: '100%',
                bgcolor: '#0a0a0a',
                color: '#ededed',
                position: 'relative',
                overflow: 'hidden',
                backgroundImage:
                    'radial-gradient(1100px 600px at 12% -10%, rgba(59, 130, 246, 0.10), transparent 60%)',
            }}
        >
            <Box
                sx={{
                    maxWidth: 1200,
                    mx: 'auto',
                    px: { xs: 3, md: 6 },
                    pt: { xs: 6, md: 10 },
                    pb: { xs: 8, md: 12 },
                    position: 'relative',
                }}
            >
                <Box sx={{ maxWidth: 720, mb: { xs: 5, md: 8 } }}>
                    <Typography
                        component="h1"
                        sx={{
                            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            fontSize: { xs: '2rem', md: '3rem' },
                            fontWeight: 600,
                            letterSpacing: '-0.02em',
                            lineHeight: 1.1,
                            color: '#f5f5f5',
                            mb: 2,
                        }}
                    >
                        Tools for the people who run the platform.
                    </Typography>
                    <Typography
                        sx={{
                            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            fontSize: '1.05rem',
                            lineHeight: 1.55,
                            color: '#9ca3af',
                            maxWidth: '60ch',
                        }}
                    >
                        Five focused surfaces for jobs, scans, users, and reference data. Pick one.
                    </Typography>
                </Box>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                        gap: { xs: 2, md: 3 },
                    }}
                >
                    {ENTRIES.map((entry, i) => (
                        <ToolCard
                            key={entry.path}
                            entry={entry}
                            index={i}
                            mounted={mounted}
                        />
                    ))}
                </Box>
            </Box>
        </Box>
    );
}

function ToolCard({ entry, index, mounted }: { entry: Entry; index: number; mounted: boolean }) {
    const isWide = entry.span === 'wide';

    return (
        <Box
            component={Link}
            href={entry.path}
            className="superpower-card"
            sx={{
                position: 'relative',
                gridColumn: { xs: 'auto', md: isWide ? '1 / -1' : 'auto' },
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                bgcolor: '#141414',
                border: '1px solid #262626',
                borderRadius: '16px',
                p: { xs: 3, md: 4 },
                minHeight: { xs: 160, md: isWide ? 200 : 180 },
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'border-color 220ms ease, transform 220ms ease, background-color 220ms ease',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                transitionDelay: mounted ? `${index * 50}ms` : '0ms',
                '&:hover': {
                    borderColor: '#3b82f6',
                    transform: 'translateY(-2px)',
                    bgcolor: '#171717',
                    '& .superpower-arrow': { color: '#3b82f6', transform: 'translate(2px, -2px)' },
                },
                '&:focus-visible': {
                    outline: '2px solid #3b82f6',
                    outlineOffset: '2px',
                },
                '&:active': {
                    transform: 'translateY(0)',
                },
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    bgcolor: '#3b82f6',
                    opacity: 0.6,
                }}
            />

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box
                    sx={{
                        flexShrink: 0,
                        width: 44,
                        height: 44,
                        borderRadius: '12px',
                        bgcolor: 'rgba(59, 130, 246, 0.10)',
                        color: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        '& svg': { fontSize: 22 },
                    }}
                >
                    {entry.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                            component="span"
                            sx={{
                                fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                                fontSize: isWide ? '1.25rem' : '1.0625rem',
                                fontWeight: 600,
                                color: '#f5f5f5',
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {entry.label}
                        </Typography>
                        <ArrowOutwardIcon
                            className="superpower-arrow"
                            sx={{
                                fontSize: 16,
                                color: '#6b7280',
                                transition: 'color 220ms ease, transform 220ms ease',
                            }}
                        />
                    </Box>
                    <Typography
                        sx={{
                            mt: 0.75,
                            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            fontSize: '0.9rem',
                            lineHeight: 1.5,
                            color: '#9ca3af',
                            maxWidth: '52ch',
                        }}
                    >
                        {entry.description}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
