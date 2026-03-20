'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import Checkbox from '@mui/material/Checkbox';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    lastLogin?: string;
    towerAssignments?: any[];
    _count?: {
        towerAssignments: number;
        notes: number;
    };
}

interface Tower {
    id: number;
    lat: number;
    lon: number;
    type: string;
    status: string;
    parcel?: {
        address?: string;
        city?: string;
        state?: string;
    };
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function AdminUserDetailPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const userId = parseInt(resolvedParams.id);
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [allTowers, setAllTowers] = useState<Tower[]>([]);
    const [loading, setLoading] = useState(true);
    const [towersLoading, setTowersLoading] = useState(true); // Start as true
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');
    const [selectedTowers, setSelectedTowers] = useState<number[]>([]);
    const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        role: 'CALLER',
        isActive: true
    });

    useEffect(() => {
        console.log('UserDetailPage: Component mounted, userId:', userId);
        loadUser();
        loadTowers();
    }, [userId]);

    const loadUser = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/users/${userId}`);
            setUser(res.data);
            setFormData({
                name: res.data.name,
                email: res.data.email,
                role: res.data.role,
                isActive: res.data.isActive
            });
            // Set currently assigned towers
            if (res.data.towerAssignments) {
                const assignedIds = res.data.towerAssignments.map((a: any) => a.tower.id);
                setSelectedTowers(assignedIds);
            }
        } catch (error: any) {
            console.error('Failed to load user:', error);
            setMessageType('error');
            setMessage(error.response?.data?.error || 'Failed to load user');
        } finally {
            setLoading(false);
        }
    };

    const loadTowers = async () => {
        try {
            setTowersLoading(true);
            console.log('Loading towers...');
            const res = await axios.get('/api/towers');
            // Handle both paginated and non-paginated responses
            const towers = res.data.data || res.data;
            console.log('Towers loaded:', towers?.length, 'towers');
            // Ensure we always set an array
            const towersArray = Array.isArray(towers) ? towers : [];
            setAllTowers(towersArray);
            console.log('Towers state set:', towersArray.length);
        } catch (error) {
            console.error('Failed to load towers:', error);
            setAllTowers([]); // Set empty array on error
        } finally {
            setTowersLoading(false);
            console.log('Towers loading complete');
        }
    };

    const handleUpdateUser = async () => {
        try {
            await axios.patch(`/api/users/${userId}`, formData);
            setMessage('User updated successfully');
            setMessageType('success');
            loadUser();
        } catch (error: any) {
            setMessageType('error');
            setMessage(error.response?.data?.error || 'Failed to update user');
        }
    };

    const handleResetPassword = async () => {
        if (newPassword.length < 8) {
            setMessageType('error');
            setMessage('Password must be at least 8 characters');
            return;
        }

        try {
            await axios.post(`/api/users/${userId}/reset-password`, {
                newPassword
            });
            setMessageType('success');
            setMessage(`Password reset successfully for ${user?.name}`);
            setResetPasswordDialogOpen(false);
            setNewPassword('');
        } catch (error: any) {
            setMessageType('error');
            setMessage(error.response?.data?.error || 'Failed to reset password');
        }
    };

    const handleUpdateAssignments = async () => {
        try {
            // Get current assignments
            const currentAssignments = user?.towerAssignments?.map((a: any) => a.tower.id) || [];
            const newAssignments = selectedTowers as number[];

            // Find towers to add and remove
            const toAdd = newAssignments.filter(id => !currentAssignments.includes(id));
            const toRemove = currentAssignments.filter((id: number) => !newAssignments.includes(id));

            // Add new assignments
            if (toAdd.length > 0) {
                await axios.post('/api/tower-assignments', {
                    userId,
                    towerIds: toAdd
                });
            }

            // Remove old assignments
            for (const towerId of toRemove) {
                await axios.delete(`/api/tower-assignments?userId=${userId}&towerId=${towerId}`);
            }

            setMessage(`Successfully updated tower assignments (${toAdd.length} added, ${toRemove.length} removed)`);
            setMessageType('success');
            loadUser();
        } catch (error: any) {
            setMessageType('error');
            setMessage(error.response?.data?.error || 'Failed to update tower assignments');
        }
    };

    const handleToggleSelection = (towerId: number) => {
        setSelectedTowers(prev =>
            prev.includes(towerId)
                ? prev.filter(id => id !== towerId)
                : [...prev, towerId]
        );
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedTowers(allTowers.map(t => t.id));
        } else {
            setSelectedTowers([]);
        }
    };

    const towerColumns: GridColDef[] = [
        {
            field: 'select',
            headerName: '',
            width: 50,
            sortable: false,
            renderHeader: () => (
                <Checkbox
                    checked={selectedTowers.length === allTowers.length && allTowers.length > 0}
                    indeterminate={selectedTowers.length > 0 && selectedTowers.length < allTowers.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                />
            ),
            renderCell: (params: GridRenderCellParams) => (
                <Checkbox
                    checked={selectedTowers.includes(params.row.id)}
                    onChange={() => handleToggleSelection(params.row.id)}
                />
            )
        },
        {
            field: 'id',
            headerName: 'ID',
            width: 70
        },
        {
            field: 'address',
            headerName: 'Address',
            flex: 1,
            minWidth: 200,
            valueGetter: (value, row) => row.parcel?.address || 'N/A'
        },
        {
            field: 'city',
            headerName: 'City',
            width: 150,
            valueGetter: (value, row) => row.parcel?.city || 'N/A'
        },
        {
            field: 'state',
            headerName: 'State',
            width: 80,
            valueGetter: (value, row) => row.parcel?.state || 'N/A'
        },
        {
            field: 'type',
            headerName: 'Type',
            width: 120
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            renderCell: (params: GridRenderCellParams) => (
                <Chip label={params.value} size="small" />
            )
        }
    ];

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!user) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">User not found</Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => router.push('/admin/users')}
                    sx={{ mr: 2 }}
                >
                    Back
                </Button>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>User Details</Typography>
            </Box>

            {message && (
                <Alert severity={messageType} sx={{ mb: 3 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}

            {/* User Information */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Account Information</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        label="Email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        fullWidth
                    />
                    <FormControl fullWidth>
                        <InputLabel>Role</InputLabel>
                        <Select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            label="Role"
                        >
                            <MenuItem value="CALLER">Caller</MenuItem>
                            <MenuItem value="ADMIN">Admin</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={formData.isActive ? 'active' : 'inactive'}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                            label="Status"
                        >
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="inactive">Inactive</MenuItem>
                        </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button variant="contained" onClick={handleUpdateUser} sx={{ flex: 1 }}>
                            Update User
                        </Button>
                        <Button
                            variant="outlined"
                            color="warning"
                            onClick={() => setResetPasswordDialogOpen(true)}
                            sx={{ flex: 1 }}
                        >
                            Reset Password
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* Statistics */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Statistics</Typography>
                <Box sx={{ display: 'flex', gap: 3 }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">Assigned Towers</Typography>
                        <Typography variant="h4">{user._count?.towerAssignments || 0}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">Notes Created</Typography>
                        <Typography variant="h4">{user._count?.notes || 0}</Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">Last Login</Typography>
                        <Typography variant="body1">
                            {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                        </Typography>
                    </Box>
                </Box>
            </Paper>

            {/* Tower Assignments */}
            {!loading && !towersLoading && (() => {
                console.log('Rendering DataGrid section:', {
                    allTowersLength: allTowers?.length,
                    selectedTowersLength: selectedTowers?.length,
                    isArray: Array.isArray(allTowers)
                });
                return true;
            })() && (
                <Paper sx={{ p: 3, height: 700 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Tower Assignments</Typography>
                        <Button variant="contained" onClick={handleUpdateAssignments}>
                            Save Assignments
                        </Button>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Select towers to assign to this user. Currently assigned: {selectedTowers.length}
                    </Typography>
                    {allTowers.length > 0 ? (
                        <DataGrid
                            rows={allTowers}
                            columns={towerColumns}
                            pageSizeOptions={[25, 50, 100]}
                            initialState={{
                                pagination: { paginationModel: { pageSize: 25 } }
                            }}
                            disableRowSelectionOnClick
                            sx={{ height: 550 }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 550 }}>
                            <Typography variant="body1" color="text.secondary">
                                No towers available
                            </Typography>
                        </Box>
                    )}
                </Paper>
            )}

            {/* Reset Password Dialog */}
            <Dialog open={resetPasswordDialogOpen} onClose={() => setResetPasswordDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Reset Password for {user?.name}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <Alert severity="warning">
                            This will immediately change the user&apos;s password. They will need to use the new password to log in.
                        </Alert>
                        <TextField
                            label="New Password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            fullWidth
                            required
                            helperText="Must be at least 8 characters"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setResetPasswordDialogOpen(false);
                        setNewPassword('');
                    }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleResetPassword}
                        variant="contained"
                        color="warning"
                        disabled={newPassword.length < 8}
                    >
                        Reset Password
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
