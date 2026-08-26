'use client';

import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import ExploreIcon from '@mui/icons-material/Explore';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import RadarIcon from '@mui/icons-material/Radar';
import SettingsIcon from '@mui/icons-material/Settings';

const ENTRIES = [
    {
        label: 'Tower Leads',
        description: 'Search history, imported leads, and promotion to towers.',
        path: '/superpowers/tower-leads',
        icon: <ExploreIcon fontSize="large" />,
    },
    {
        label: 'Users',
        description: 'Create, edit, and reset app users.',
        path: '/superpowers/users',
        icon: <AdminPanelSettingsIcon fontSize="large" />,
    },
    {
        label: 'Background Jobs',
        description: 'Trigger and retry queued jobs (normalize, NRCAN, phone validation, Geoapify).',
        path: '/superpowers/jobs',
        icon: <AutorenewIcon fontSize="large" />,
    },
    {
        label: 'Discovery Scans',
        description: 'Live progress for running discovery scans.',
        path: '/superpowers/discovery',
        icon: <RadarIcon fontSize="large" />,
    },
    {
        label: 'Lookups',
        description: 'Manage lookup data (carriers, tower types, statuses, etc.).',
        path: '/superpowers/lookups',
        icon: <SettingsIcon fontSize="large" />,
    },
] as const;

export default function SuperpowersLanding() {
    const { data: session, status } = useSession();

    if (status === 'loading') {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress />
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
        <Box sx={{ p: 4 }}>
            <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>
                Superpowers
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Technical tools for managing the platform. Reserved for admins.
            </Typography>
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                flexWrap="wrap"
                gap={3}
            >
                {ENTRIES.map((entry) => (
                    <Paper
                        key={entry.path}
                        component={Link}
                        href={entry.path}
                        elevation={0}
                        sx={{
                            flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 24px)', md: '1 1 calc(33% - 24px)' },
                            p: 3,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2,
                            textDecoration: 'none',
                            color: 'inherit',
                            transition: 'border-color 0.2s ease, transform 0.2s ease',
                            '&:hover': {
                                borderColor: 'primary.main',
                                transform: 'translateY(-2px)',
                            },
                        }}
                    >
                        <Box sx={{ color: 'primary.main', mb: 1.5 }}>{entry.icon}</Box>
                        <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5 }}>
                            {entry.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {entry.description}
                        </Typography>
                    </Paper>
                ))}
            </Stack>
        </Box>
    );
}
