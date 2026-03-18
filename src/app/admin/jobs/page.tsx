'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingIcon from '@mui/icons-material/Pending';
import AutorenewIcon from '@mui/icons-material/Autorenew';
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
    params: any;
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
        } catch (error: any) {
            console.error('Failed to load jobs:', error);
            setMessage('Failed to load jobs');
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session?.user?.role === Role.ADMIN) {
            loadJobs();
        }
    }, [session]);

    if (status === 'loading') {
        return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
    }

    if (session?.user?.role !== Role.ADMIN) {
        return (
            <Box sx={{ p: 4 }}>
                <Alert severity="error">Access Denied. Admin privileges required.</Alert>
            </Box>
        );
    }

    const triggerGeoapify = async () => {
        try {
            setMessage('Triggering Geoapify batch...');
            setMessageType('success');
            await axios.get('/api/cron/trigger-geoapify');
            setMessage('Geoapify batch job enqueued successfully');
            loadJobs();
        } catch (error: any) {
            setMessage('Failed to trigger Geoapify batch');
            setMessageType('error');
        }
    };

    const triggerNRCan = async () => {
        try {
            setMessage('Triggering NRCan batch...');
            setMessageType('success');
            await axios.get('/api/cron/trigger-nrcan');
            setMessage('NRCan batch job enqueued successfully');
            loadJobs();
        } catch (error: any) {
            setMessage('Failed to trigger NRCan batch');
            setMessageType('error');
        }
    };

    const processQueue = async () => {
        try {
            setMessage('Processing next job in queue...');
            setMessageType('success');
            const res = await axios.get('/api/cron/process-jobs');
            if (res.data.processed > 0) {
                setMessage(`Processed job: ${res.data.jobType}`);
            } else {
                setMessage('No pending jobs to process or scheduled for later');
            }
            loadJobs();
        } catch (error: any) {
            setMessage('Failed to process queue');
            setMessageType('error');
        }
    };

    const retryJob = async (id: number) => {
        try {
            setLoading(true);
            await axios.post(`/api/admin/jobs/${id}/retry`);
            setMessage(`Job #${id} reset to pending`);
            setMessageType('success');
            loadJobs();
        } catch (error: any) {
            setMessage('Failed to retry job');
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    const columns: GridColDef[] = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'jobType', headerName: 'Type', width: 220 },
        {
            field: 'status',
            headerName: 'Status',
            width: 130,
            renderCell: (params: GridRenderCellParams) => {
                const colors: Record<string, any> = {
                    pending: 'default',
                    processing: 'info',
                    completed: 'success',
                    failed: 'error'
                };
                const icons: Record<string, any> = {
                    pending: <PendingIcon fontSize="small" />,
                    processing: <AutorenewIcon fontSize="small" className="spin" />,
                    completed: <CheckCircleOutlineIcon fontSize="small" />,
                    failed: <ErrorOutlineIcon fontSize="small" />
                };
                return (
                    <Chip
                        icon={icons[params.value] || null}
                        label={params.value.toUpperCase()}
                        color={colors[params.value] || 'default'}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                    />
                );
            }
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 100,
            renderCell: (params: GridRenderCellParams) => (
                params.row.status === 'failed' ? (
                    <Button
                        size="small"
                        startIcon={<ReplayIcon />}
                        onClick={() => retryJob(params.row.id)}
                    >
                        Retry
                    </Button>
                ) : null
            )
        },
        {
            field: 'attempts',
            headerName: 'Retries',
            width: 100,
            renderCell: (params: GridRenderCellParams) => (
                <Typography variant="body2">
                    {params.row.attempts} / {params.row.maxAttempts}
                </Typography>
            )
        },
        {
            field: 'runAfter',
            headerName: 'Run After',
            width: 180,
            renderCell: (params: GridRenderCellParams) =>
                new Date(params.value).toLocaleString()
        },
        {
            field: 'createdAt',
            headerName: 'Created At',
            width: 180,
            renderCell: (params: GridRenderCellParams) =>
                new Date(params.value).toLocaleString()
        },
        {
            field: 'error',
            headerName: 'Error/Last Message',
            flex: 1,
            minWidth: 200,
            renderCell: (params: GridRenderCellParams) => (
                <Typography variant="caption" color="error" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {params.value || '-'}
                </Typography>
            )
        }
    ];

    return (
        <Box sx={{ p: 3, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>Background Jobs</Typography>
                <Stack direction="row" spacing={2}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadJobs}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<PlayArrowIcon />}
                        onClick={processQueue}
                        disabled={loading}
                    >
                        Process Next
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<PlayArrowIcon />}
                        onClick={triggerGeoapify}
                        disabled={loading}
                    >
                        Trigger Geoapify Batch
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<PlayArrowIcon />}
                        onClick={triggerNRCan}
                        disabled={loading}
                    >
                        Trigger NRCan Batch
                    </Button>
                </Stack>
            </Box>

            {message && (
                <Alert severity={messageType} sx={{ mb: 2 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}

            <Paper sx={{ flex: 1, overflow: 'hidden' }}>
                <DataGrid
                    rows={jobs}
                    columns={columns}
                    loading={loading}
                    pageSizeOptions={[10, 25, 50, 100]}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 25 } }
                    }}
                    disableRowSelectionOnClick
                    sx={{
                        '& .spin': {
                            animation: 'spin 2s linear infinite',
                        },
                        '@keyframes spin': {
                            '0%': { transform: 'rotate(0deg)' },
                            '100%': { transform: 'rotate(360deg)' },
                        },
                    }}
                />
            </Paper>
        </Box>
    );
}
