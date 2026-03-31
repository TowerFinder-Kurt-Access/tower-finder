'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Grid from '@mui/material/Grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import RadarIcon from '@mui/icons-material/Radar';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import CellTowerIcon from '@mui/icons-material/CellTower';
import TimerIcon from '@mui/icons-material/Timer';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import Alert from '@mui/material/Alert';

// Lazy load the map component to avoid SSR issues with Leaflet
const DiscoveryMap = dynamic(() => import('@/components/DiscoveryMap'), {
    ssr: false,
    loading: () => (
        <Box sx={{ height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#111' }}>
            <CircularProgress />
        </Box>
    ),
});

interface DiscoveryScan {
    id: number;
    state: string;
    country: string;
    status: string;
    totalCells: number;
    completedCells: number;
    failedCells: number;
    foundLeads: number;
    h3Resolution: number;
    progressPercent: number;
    remainingCells: number;
    estimatedTimeMinutes: number | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
}

interface MapCell {
    lat: number;
    lon: number;
    h3Index: string;
    status: 'completed' | 'pending' | 'failed';
    foundCount: number;
}

export default function DiscoveryProgressPage() {
    const { data: session, status } = useSession();
    const [scans, setScans] = useState<DiscoveryScan[]>([]);
    const [mapData, setMapData] = useState<MapCell[]>([]);
    const [selectedScan, setSelectedScan] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [mapLoading, setMapLoading] = useState(false);

    const loadScans = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/admin/discovery-progress');
            setScans(res.data.scans);
            // Auto-select the first scan if none selected
            if (!selectedScan && res.data.scans.length > 0) {
                setSelectedScan(res.data.scans[0].state);
            }
        } catch (error) {
            console.error('Failed to load discovery progress:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedScan]);

    const loadMapData = useCallback(async (state: string) => {
        try {
            setMapLoading(true);
            const res = await axios.get(`/api/admin/discovery-progress?includeMap=true&state=${encodeURIComponent(state)}`);
            setMapData(res.data.mapData || []);
        } catch (error) {
            console.error('Failed to load map data:', error);
        } finally {
            setMapLoading(false);
        }
    }, []);

    useEffect(() => {
        if (session?.user?.role === Role.ADMIN) {
            loadScans();
        }
    }, [session, loadScans]);

    // Load map data when a scan is selected
    useEffect(() => {
        if (selectedScan) {
            loadMapData(selectedScan);
        }
    }, [selectedScan, loadMapData]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadScans();
            if (selectedScan) loadMapData(selectedScan);
        }, 30000);
        return () => clearInterval(interval);
    }, [loadScans, loadMapData, selectedScan]);

    if (status === 'loading') {
        return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
    }

    if (session?.user?.role !== Role.ADMIN) {
        return <Box sx={{ p: 4 }}><Alert severity="error">Access Denied. Admin privileges required.</Alert></Box>;
    }

    const activeScan = scans.find(s => s.state === selectedScan);

    const statusColor = (status: string) => {
        switch (status) {
            case 'running': return '#4CAF50';
            case 'completed': return '#2196F3';
            case 'failed': return '#f44336';
            case 'paused': return '#ff9800';
            default: return '#9e9e9e';
        }
    };

    const formatDuration = (start: string, end?: string | null) => {
        const startDate = new Date(start);
        const endDate = end ? new Date(end) : new Date();
        const diffMs = endDate.getTime() - startDate.getTime();
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    return (
        <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <RadarIcon sx={{ fontSize: 32, color: '#4CAF50' }} />
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}>
                            Discovery Scans
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Automated rooftop lease discovery across geographic regions
                        </Typography>
                    </Box>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={() => { loadScans(); if (selectedScan) loadMapData(selectedScan); }}
                    disabled={loading}
                >
                    Refresh
                </Button>
            </Box>

            {/* Scan Cards */}
            {scans.length === 0 && !loading && (
                <Alert severity="info">No discovery scans found. Run the seed script to start scanning a state.</Alert>
            )}

            <Stack direction="row" spacing={2} sx={{ 
                overflowX: 'auto', 
                pb: 4, 
                px: 1, 
                '&::-webkit-scrollbar': { height: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 3 }
            }}>
                {scans.map(scan => (
                    <Paper
                        key={scan.id}
                        variant="outlined"
                        onClick={() => setSelectedScan(scan.state)}
                        sx={{
                            p: 2.5,
                            minWidth: 320,
                            width: 320,
                            height: 220, // Fixed height to prevent layout shifts and cutoffs
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: 3,
                            bgcolor: selectedScan === scan.state ? 'rgba(76, 175, 80, 0.05)' : 'background.paper',
                            borderColor: selectedScan === scan.state ? 'primary.main' : 'divider',
                            transition: 'all 0.2s ease-in-out',
                            '&:hover': { 
                                borderColor: 'primary.main',
                                transform: 'translateY(-4px)',
                                boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
                            },
                        }}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                            <Box>
                                <Typography variant="subtitle1" fontWeight={800} color="text.primary">
                                    {scan.state}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Res {scan.h3Resolution} · {scan.totalCells} cells
                                </Typography>
                            </Box>
                            <Chip
                                label={scan.status.toUpperCase()}
                                size="small"
                                color={scan.status === 'running' ? 'primary' : 'default'}
                                sx={{ 
                                    fontWeight: 900, fontSize: '0.65rem', height: 20,
                                    bgcolor: scan.status === 'paused' ? 'warning.main' : undefined 
                                }}
                            />
                        </Box>

                        <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">PROGRESS</Typography>
                                <Typography variant="subtitle2" fontWeight={900} color="primary">
                                    {scan.progressPercent}%
                                </Typography>
                            </Box>
                            <LinearProgress
                                variant="determinate"
                                value={scan.progressPercent}
                                sx={{
                                    height: 10,
                                    borderRadius: 5,
                                    bgcolor: 'rgba(255,255,255,0.05)',
                                    '& .MuiLinearProgress-bar': { borderRadius: 5 }
                                }}
                            />
                        </Box>

                        <Box sx={{ 
                            mt: 2, 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr', 
                            gap: 1.5,
                            pt: 2,
                            borderTop: '1px solid',
                            borderColor: 'divider'
                        }}>
                            {[
                                { icon: <CheckCircleIcon sx={{ fontSize: 16 }} />, val: scan.completedCells, color: '#4CAF50' },
                                { icon: <ErrorIcon sx={{ fontSize: 16 }} />, val: scan.failedCells, color: '#f44336' },
                                { icon: <PendingIcon sx={{ fontSize: 16 }} />, val: scan.totalCells - scan.completedCells - scan.failedCells, color: 'text.secondary' },
                                { icon: <CellTowerIcon sx={{ fontSize: 16 }} />, val: scan.foundLeads, color: '#ff9800', suffix: ' leads' },
                            ].map((stat, idx) => (
                                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ color: stat.color, display: 'flex' }}>{stat.icon}</Box>
                                    <Typography variant="caption" fontWeight={700}>
                                        {stat.val}{stat.suffix}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                ))}
            </Stack>


            {/* Map Header */}
            {activeScan && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mt: 1 }}>
                    <Box>
                        <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1 }}>
                            {activeScan.state} — Coverage Map
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4CAF50' }} /> Completed
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ff9800' }} /> Leads Found
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f44336' }} /> Failed
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.1)' }} /> Pending
                            </Typography>
                        </Box>
                    </Box>
                    {mapLoading && <Typography variant="caption" color="primary" sx={{ animation: 'pulse 1s infinite' }}>Updating map data...</Typography>}
                </Box>
            )}

            {/* Map Section */}
            {activeScan && (
                <Paper sx={{ flex: 1, minHeight: 400, overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                    {/* Legend overlay removed in favor of header and clearer markers */}
                    <DiscoveryMap cells={mapData} state={activeScan.state} />
                </Paper>
            )}
        </Box>
    );
}
