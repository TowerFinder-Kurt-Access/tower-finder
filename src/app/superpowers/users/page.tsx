'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios, { AxiosError } from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import CircularProgress from '@mui/material/CircularProgress';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { validatePassword } from '@/lib/password-policy';
import { PasswordField } from '@/components/PasswordField';
import DeleteIcon from '@mui/icons-material/Delete';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    lastLogin?: string;
}

export default function AdminUsersPage() {
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [dialogError, setDialogError] = useState('');
    const [formData, setFormData] = useState({
        email: '',
        name: '',
        password: '',
        role: 'CALLER',
        isActive: true
    });
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');

    useEffect(() => {
        if (session?.user?.role === Role.ADMIN) {
            loadUsers();
        }
    }, [session]);

    if (sessionStatus === 'loading') return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    if (session?.user?.role !== Role.ADMIN) {
        return (
            <Box sx={{ p: 4 }}>
                <Alert severity="error">Access Denied. Admin privileges required.</Alert>
            </Box>
        );
    }

    const loadUsers = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/users');
            setUsers(res.data);
        } catch (error: unknown) {
            console.error('Failed to load users:', error);
            if (error instanceof AxiosError && error.response?.status === 403) {
                setMessage('Access denied. Admin privileges required.');
                setMessageType('error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async () => {
        setDialogError('');
        setCreating(true);
        try {
            await axios.post('/api/users', formData);
            setMessage('User created successfully');
            setMessageType('success');
            setDialogOpen(false);
            setFormData({
                email: '',
                name: '',
                password: '',
                role: 'CALLER',
                isActive: true
            });
            loadUsers();
        } catch (error: unknown) {
            // Errors render inside the dialog (page-level alerts sit behind the overlay).
            const message = error instanceof AxiosError
                ? error.response?.data?.error || 'Failed to create user'
                : 'Failed to create user';
            setDialogError(message);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }

        try {
            await axios.delete(`/api/users/${userId}`);
            setMessage('User deleted successfully');
            setMessageType('success');
            loadUsers();
        } catch (error: unknown) {
            setMessageType('error');
            const message = error instanceof AxiosError
                ? error.response?.data?.error || 'Failed to delete user'
                : 'Failed to delete user';
            setMessage(message);
        }
    };

    const columns: GridColDef[] = [
        {
            field: 'id',
            headerName: 'ID',
            width: 70
        },
        {
            field: 'name',
            headerName: 'Name',
            flex: 1,
            minWidth: 150
        },
        {
            field: 'email',
            headerName: 'Email',
            flex: 1,
            minWidth: 200
        },
        {
            field: 'role',
            headerName: 'Role',
            width: 100,
            renderCell: (params: GridRenderCellParams) => (
                <Chip
                    label={params.value}
                    color={params.value === 'ADMIN' ? 'primary' : 'default'}
                    size="small"
                />
            )
        },
        {
            field: 'isActive',
            headerName: 'Status',
            width: 100,
            renderCell: (params: GridRenderCellParams) => (
                <Chip
                    label={params.value ? 'Active' : 'Inactive'}
                    color={params.value ? 'success' : 'default'}
                    size="small"
                />
            )
        },
        {
            field: 'lastLogin',
            headerName: 'Last Login',
            width: 180,
            renderCell: (params: GridRenderCellParams) =>
                params.value ? new Date(params.value).toLocaleString() : 'Never'
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 120,
            sortable: false,
            renderCell: (params: GridRenderCellParams) => (
                <Box>
                    <IconButton
                        size="small"
                        onClick={() => router.push(`/admin/users/${params.row.id}`)}
                        title="View Details"
                    >
                        <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteUser(params.row.id)}
                        title="Delete User"
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Box>
            )
        }
    ];

    return (
        <Box sx={{ p: 3, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>User Management</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => { setDialogOpen(true); setDialogError(''); }}
                >
                    Create User
                </Button>
            </Box>

            {message && (
                <Alert severity={messageType} sx={{ mb: 2 }} onClose={() => setMessage('')}>
                    {message}
                </Alert>
            )}

            <Paper sx={{ flex: 1, overflow: 'hidden' }}>
                <DataGrid
                    rows={users}
                    columns={columns}
                    loading={loading}
                    pageSizeOptions={[10, 25, 50]}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 25 } }
                    }}
                    disableRowSelectionOnClick
                />
            </Paper>

            {/* Create User Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New User</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {dialogError && (
                            <Alert severity="error" onClose={() => setDialogError('')}>
                                {dialogError}
                            </Alert>
                        )}
                        <TextField
                            label="Name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            fullWidth
                            required
                        />
                        <PasswordField
                            label="Password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            fullWidth
                            required
                            error={!!formData.password && !!validatePassword(formData.password)}
                            helperText={
                                formData.password && validatePassword(formData.password)
                                    ? validatePassword(formData.password)
                                    : 'At least 10 characters, with upper, lower, number, and special characters'
                            }
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
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleCreateUser}
                        variant="contained"
                        disabled={creating || !formData.email || !formData.name || !!validatePassword(formData.password)}
                    >
                        {creating ? 'Creating...' : 'Create User'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
