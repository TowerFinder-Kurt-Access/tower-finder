'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import RefreshIcon from '@mui/icons-material/Refresh';
import RadarIcon from '@mui/icons-material/Radar';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import CellTowerIcon from '@mui/icons-material/CellTower';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';

const DiscoveryMap = dynamic(() => import('@/components/DiscoveryMap'), {
    ssr: false,
    loading: () => (
        <Box sx={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0f1115', borderRadius: 2, border: '1px solid #222' }}>
            <CircularProgress size={28} sx={{ color: '#10b981' }} />
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
    status: 'completed' | 'pending' | 'processing' | 'failed';
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

    useEffect(() => {
        if (selectedScan) loadMapData(selectedScan);
    }, [selectedScan, loadMapData]);

    useEffect(() => {
        const interval = setInterval(() => {
            loadScans();
            if (selectedScan) loadMapData(selectedScan);
        }, 30000);
        return () => clearInterval(interval);
    }, [loadScans, loadMapData, selectedScan]);

    if (status === 'loading') {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }
    if (session?.user?.role !== Role.ADMIN) {
        return <Box sx={{ p: 4 }}><Alert severity="error">Access Denied. Admin privileges required.</Alert></Box>;
    }

    const activeScan = scans.find(s => s.state === selectedScan);
    const clamp = (n: number) => Math.max(0, Math.min(100, n));

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f7f8f9', px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
            {/* Header */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 2.5 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#111', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RadarIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.6px', lineHeight: 1.1, color: '#0f172a' }}>Discovery Scans</Typography>
                        <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13, mt: 0.2 }}>Automated rooftop lease discovery across regions</Typography>
                    </Box>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
                    onClick={() => { loadScans(); if (selectedScan) loadMapData(selectedScan); }}
                    disabled={loading}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, borderColor: '#e2e8f0', color: '#0f172a', bgcolor: 'white', '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' } }}
                >
                    Refresh
                </Button>
            </Box>

            {loading && scans.length === 0 ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
                    {[0, 1, 2].map(i => (
                        <Paper key={i} variant="outlined" sx={{ p: 2.5, height: 188, borderRadius: 3, bgcolor: 'white' }}>
                            <Box sx={{ height: 14, width: 90, bgcolor: '#e2e8f0', borderRadius: 1, mb: 1.5 }} />
                            <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 99 }} />
                        </Paper>
                    ))}
                </Box>
            ) : scans.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>No discovery scans found. Run the seed script to start scanning a state.</Alert>
            ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: { xs: 1.5, md: 2 } }}>
                    {scans.map(scan => {
                        const isSelected = selectedScan === scan.state;
                        const pct = clamp(scan.progressPercent);
                        const pending = Math.max(0, scan.totalCells - scan.completedCells - scan.failedCells);
                        const statusKey = scan.status.toLowerCase();
                        return (
                            <Paper
                                key={scan.id}
                                onClick={() => setSelectedScan(scan.state)}
                                elevation={0}
                                sx={{
                                    p: 2.2,
                                    borderRadius: 3,
                                    cursor: 'pointer',
                                    bgcolor: 'white',
                                    border: '1px solid',
                                    borderColor: isSelected ? '#10b981' : '#e2e8f0',
                                    boxShadow: isSelected ? '0 8px 24px rgba(16,185,129,0.12)' : '0 1px 0 rgba(15,23,42,0.04)',
                                    transition: 'all 0.18s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    minWidth: 0,
                                    '&:hover': { borderColor: '#10b981', transform: { xs: 'none', md: 'translateY(-2px)' }, boxShadow: '0 10px 28px rgba(15,23,42,0.08)' },
                                }}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1.2 }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.2, color: '#0f172a' }} noWrap>{scan.state}</Typography>
                                        <Typography sx={{ fontSize: 11.5, color: '#64748b', mt: 0.3 }}>Res {scan.h3Resolution} · {scan.totalCells.toLocaleString()} cells</Typography>
                                    </Box>
                                    <Chip
                                        label={scan.status}
                                        size="small"
                                        sx={{
                                            height: 22,
                                            fontSize: 10,
                                            fontWeight: 800,
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            borderRadius: 99,
                                            border: '1px solid',
                                            ...(statusKey === 'running'
                                                ? { bgcolor: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }
                                                : statusKey === 'paused'
                                                    ? { bgcolor: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }
                                                    : statusKey === 'completed'
                                                        ? { bgcolor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
                                                        : statusKey === 'failed'
                                                            ? { bgcolor: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }
                                                            : { bgcolor: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' }),
                                        }}
                                    />
                                </Box>

                                <Box sx={{ mt: 0.6, mb: 1.2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.7 }}>
                                        <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8' }}>PROGRESS</Typography>
                                        <Typography sx={{ fontSize: 13, fontWeight: 900, color: isSelected ? '#059669' : '#0f172a' }}>{pct}%</Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={pct}
                                        sx={{
                                            height: 7,
                                            borderRadius: 99,
                                            bgcolor: '#f1f5f9',
                                            '& .MuiLinearProgress-bar': { borderRadius: 99, bgcolor: '#10b981' },
                                        }}
                                    />
                                    {scan.progressPercent > 100 && (
                                        <Typography sx={{ fontSize: 10, color: '#dc2626', mt: 0.5, fontWeight: 700 }}>Capped from {scan.progressPercent}%</Typography>
                                    )}
                                </Box>

                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 'auto', pt: 1.6, borderTop: '1px solid #f1f5f9' }}>
                                    <Stat icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label="Done" value={scan.completedCells} color="#059669" />
                                    <Stat icon={<ErrorIcon sx={{ fontSize: 14 }} />} label="Failed" value={scan.failedCells} color="#dc2626" />
                                    <Stat icon={<PendingIcon sx={{ fontSize: 14 }} />} label="Pending" value={pending} color="#64748b" />
                                    <Stat icon={<CellTowerIcon sx={{ fontSize: 14 }} />} label="Leads" value={scan.foundLeads} color="#ea580c" />
                                </Box>
                            </Paper>
                        );
                    })}
                </Box>
            )}

            {activeScan && (
                <>
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 1.2, mt: 3, mb: 1.2 }}>
                        <Box>
                            <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#0f172a', letterSpacing: '-0.3px' }}>{activeScan.state} — Coverage Map</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.6, mt: 0.7 }}>
                                <Legend dot="#10b981" label="Completed" />
                                <Legend dot="#f97316" label="Leads found" />
                                <Legend dot="#ef4444" label="Failed" />
                                <Legend dot="#cbd5e1" label="Pending" />
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 20 }}>
                            {mapLoading && <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>Updating map…</Typography>}
                            <Typography sx={{ fontSize: 11, color: '#64748b' }}>{mapData.length.toLocaleString()} cells</Typography>
                        </Box>
                    </Box>

                    <Paper elevation={0} sx={{ overflow: 'hidden', borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: 'white', p: 1 }}>
                        <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid #e2e8f0', height: { xs: 380, md: 520 } }}>
                            <DiscoveryMap cells={mapData} state={activeScan.state} />
                        </Box>
                    </Paper>
                </>
            )}
        </Box>
    );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, minWidth: 0 }}>
            <Box sx={{ color, display: 'flex', flexShrink: 0 }}>{icon}</Box>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1 }} noWrap>{value.toLocaleString()}</Typography>
            <Typography sx={{ fontSize: 11, color: '#64748b', lineHeight: 1 }} noWrap>{label}</Typography>
        </Box>
    );
}

function Legend({ dot, label }: { dot: string; label: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, border: dot === '#cbd5e1' ? '1px solid #e2e8f0' : 'none' }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{label}</Typography>
        </Box>
    );
}
