'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingIcon from '@mui/icons-material/HourglassTop';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import SettingsIcon from '@mui/icons-material/Settings';
import PublicIcon from '@mui/icons-material/Public';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import CircularProgress from '@mui/material/CircularProgress';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import ReplayIcon from '@mui/icons-material/Replay';

interface Job {
    id: number;
    jobType: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    runAfter: string;
    createdAt: string;
    completedAt?: string;
    error?: string;
    params: unknown;
}

export default function AdminJobsPage() {
    const { data: session, status } = useSession();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');

    const loadJobs = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/admin/jobs');
            setJobs(res.data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to load jobs';
            setMessage(msg);
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session?.user?.role === Role.ADMIN) loadJobs();
    }, [session]);

    if (status === 'loading') return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    if (session?.user?.role !== Role.ADMIN) return <Box sx={{ p: 4 }}><Alert severity="error">Access Denied. Admin privileges required.</Alert></Box>;

    const triggerGeoapify = async () => {
        try {
            const res = await axios.post('/api/cron/process-geoapify');
            setMessage(res.data.message || 'Geoapify batch triggered');
            setMessageType('success');
            loadJobs();
        } catch (e: unknown) { setMessage(e instanceof Error ? e.message : 'Failed'); setMessageType('error'); }
    };
    const triggerNRCan = async () => {
        try {
            const res = await axios.post('/api/cron/process-nrcan');
            setMessage(res.data.message || 'NRCan batch triggered');
            setMessageType('success');
            loadJobs();
        } catch (e: unknown) { setMessage(e instanceof Error ? e.message : 'Failed'); setMessageType('error'); }
    };
    const processQueue = async () => {
        try {
            const res = await axios.post('/api/jobs/process');
            setMessage(res.data.message || 'Queue processed');
            setMessageType('success');
            loadJobs();
        } catch (e: unknown) { setMessage(e instanceof Error ? e.message : 'Failed'); setMessageType('error'); }
    };
    const retryJob = async (id: number) => {
        try {
            await axios.post(`/api/admin/jobs/${id}/retry`);
            setMessage(`Job ${id} queued for retry`);
            setMessageType('success');
            loadJobs();
        } catch (e: unknown) { setMessage(e instanceof Error ? e.message : 'Failed'); setMessageType('error'); }
    };

    const statusChip = (value: string) => {
        const key = value?.toLowerCase();
        const map: Record<string, { bg: string; color: string; border: string; icon: React.ReactNode }> = {
            pending: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', icon: <PendingIcon sx={{ fontSize: 14 }} /> },
            processing: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: <AutorenewIcon sx={{ fontSize: 14 }} className="spin" /> },
            completed: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> },
            failed: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', icon: <ErrorOutlineIcon sx={{ fontSize: 14 }} /> },
        };
        const s = map[key] || map.pending;
        return (
            <Chip icon={s.icon as React.ReactElement} label={value?.toUpperCase()} size="small" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', borderRadius: 99, border: '1px solid', bgcolor: s.bg, color: s.color, borderColor: s.border }} />
        );
    };

    const columns: GridColDef[] = [
        { field: 'id', headerName: 'ID', width: 76, headerAlign: 'left', align: 'left' },
        {
            field: 'jobType',
            headerName: 'Type',
            flex: 1,
            minWidth: 200,
            renderCell: (p: GridRenderCellParams) => {
                const isGeoapify = String(p.value ?? '').toLowerCase().includes('geoapify');
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <Box sx={{ color: isGeoapify ? '#0ea5e9' : '#475569', display: 'flex' }}>
                            {isGeoapify ? <PublicIcon sx={{ fontSize: 14 }} /> : <LocationCityIcon sx={{ fontSize: 14 }} />}
                        </Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }} noWrap>{p.value as string}</Typography>
                    </Box>
                );
            },
        },
        {
            field: 'status', headerName: 'Status', width: 152,
            renderCell: (p: GridRenderCellParams) => statusChip(p.value as string),
        },
        {
            field: 'actions', headerName: 'Action', width: 110, sortable: false, filterable: false,
            renderCell: (p: GridRenderCellParams) => p.row.status === 'failed' ? (
                <Button size="small" onClick={() => retryJob(p.row.id)} startIcon={<ReplayIcon sx={{ fontSize: 14 }} />} sx={{ textTransform: 'none', fontWeight: 800, fontSize: 12, color: '#0f172a' }}>Retry</Button>
            ) : null,
        },
        { field: 'attempts', headerName: 'Retries', width: 100, renderCell: (p: GridRenderCellParams) => <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{p.row.attempts} / {p.row.maxAttempts}</Typography> },
        { field: 'runAfter', headerName: 'Run After', width: 178, valueFormatter: (v: string) => v ? new Date(v).toLocaleString() : '-' },
        { field: 'createdAt', headerName: 'Created', width: 178, valueFormatter: (v: string) => v ? new Date(v).toLocaleString() : '-' },
        { field: 'error', headerName: 'Error', flex: 1, minWidth: 220, renderCell: (p: GridRenderCellParams) => <Typography sx={{ fontSize: 12, color: p.value ? '#991b1b' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.value || '-'}</Typography> },
    ];

    const counts = {
        pending: jobs.filter(j => j.status === 'pending').length,
        processing: jobs.filter(j => j.status === 'processing').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f7f8f9', px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2, justifyContent: 'space-between', alignItems: { xs: 'flex-start', lg: 'center' }, mb: 2.5 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#111', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SettingsIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.6px', lineHeight: 1.1, color: '#0f172a' }}>Background Jobs</Typography>
                        <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.2 }}>{jobs.length.toLocaleString()} jobs · {counts.failed} failed · {counts.pending} pending</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Button variant="outlined" onClick={loadJobs} disabled={loading} startIcon={<RefreshIcon sx={{ fontSize: 18 }} />} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: 'white', borderColor: '#e2e8f0', color: '#0f172a', '&:hover': { bgcolor: '#f8fafc' } }}>Refresh</Button>
                    <Button variant="contained" onClick={processQueue} disabled={loading} startIcon={<PlayArrowIcon sx={{ fontSize: 18 }} />} sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2, bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' } }}>Process Next</Button>
                    <Button variant="outlined" onClick={triggerGeoapify} disabled={loading} startIcon={<PlayArrowIcon sx={{ fontSize: 18 }} />} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: 'white', color: '#0f172a', borderColor: '#e2e8f0', '&:hover': { bgcolor: '#f8fafc' } }}>Geoapify</Button>
                    <Button variant="outlined" onClick={triggerNRCan} disabled={loading} startIcon={<PlayArrowIcon sx={{ fontSize: 18 }} />} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: 'white', color: '#0f172a', borderColor: '#e2e8f0', '&:hover': { bgcolor: '#f8fafc' } }}>NRCan</Button>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
                <Metric label="Pending" value={counts.pending} dot="#94a3b8" />
                <Metric label="Processing" value={counts.processing} dot="#3b82f6" />
                <Metric label="Completed" value={counts.completed} dot="#10b981" />
                <Metric label="Failed" value={counts.failed} dot="#ef4444" />
            </Box>

            {message && <Alert severity={messageType} onClose={() => setMessage('')} sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}

            <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: 'white', overflow: 'hidden' }}>
                <Box sx={{ height: { xs: 520, md: 640 }, width: '100%' }}>
                    <DataGrid
                        rows={jobs}
                        columns={columns}
                        loading={loading}
                        pageSizeOptions={[10, 25, 50, 100]}
                        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                        disableRowSelectionOnClick
                        sx={{
                            border: 0,
                            '& .MuiDataGrid-columnHeaders': { bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' },
                            '& .MuiDataGrid-cell': { borderBottom: '1px solid #f1f5f9', fontSize: 13 },
                            '& .MuiDataGrid-row:hover': { bgcolor: '#f8fafc' },
                            '& .spin': { animation: 'spin 1.2s linear infinite' },
                            '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
                        }}
                    />
                </Box>
            </Paper>
        </Box>
    );
}

function Metric({ label, value, dot }: { label: string; value: number; dot: string }) {
    return (
        <Paper elevation={0} sx={{ p: 1.6, borderRadius: 2.5, border: '1px solid #e2e8f0', bgcolor: 'white', display: 'flex', alignItems: 'center', gap: 1.4 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: dot, flexShrink: 0 }} />
            <Box>
                <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8', lineHeight: 1 }}>{label.toUpperCase()}</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 900, color: '#0f172a', lineHeight: 1, mt: 0.4 }}>{value.toLocaleString()}</Typography>
            </Box>
        </Paper>
    );
}
