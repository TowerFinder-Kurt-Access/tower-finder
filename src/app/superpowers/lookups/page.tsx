'use client';
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
    Alert, Snackbar, CircularProgress, Checkbox,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import SettingsIcon from '@mui/icons-material/Settings';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import axios from 'axios';

interface LookupItem {
    id: number;
    name: string;
}

type LookupType = 'status' | 'type' | 'carrier';

export default function LookupsManagementPage() {
    const { data: session, status: sessionStatus } = useSession();
    const [lookups, setLookups] = useState({
        statuses: [] as LookupItem[],
        types: [] as LookupItem[],
        carriers: [] as LookupItem[],
    });
    const [loading, setLoading] = useState(true);

    const [editDialog, setEditDialog] = useState<{ open: boolean; type: LookupType | ''; item: LookupItem | null }>({
        open: false, type: '', item: null,
    });
    const [editName, setEditName] = useState('');
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: LookupType | ''; item: LookupItem | null }>({
        open: false, type: '', item: null,
    });

    const [addDialog, setAddDialog] = useState<{ open: boolean; type: LookupType | '' }>({
        open: false, type: '',
    });
    const [addName, setAddName] = useState('');

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    const [selectedCarriers, setSelectedCarriers] = useState<number[]>([]);
    const [mergeDialog, setMergeDialog] = useState(false);
    const [mergeTargetName, setMergeTargetName] = useState('');
    const [merging, setMerging] = useState(false);
    const [search, setSearch] = useState<Record<LookupType, string>>({ status: '', type: '', carrier: '' });

    const fetchLookups = async () => {
        try {
            const { data } = await axios.get('/api/towers?distinct=lookups');
            setLookups({
                statuses: data.statuses || [],
                types: data.types || [],
                carriers: data.carriers || [],
            });
        } catch {
            showSnackbar('Failed to fetch lookups', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session?.user?.role === Role.ADMIN) {
            fetchLookups();
        }
    }, [session]);

    const showSnackbar = (message: string, severity: 'success' | 'error') => {
        setSnackbar({ open: true, message, severity });
    };

    const handleEditSave = async () => {
        if (!editDialog.item || !editName.trim()) return;
        try {
            await axios.put(`/api/lookups/${editDialog.type}/${editDialog.item.id}`, { name: editName });
            showSnackbar('Updated successfully', 'success');
            setEditDialog({ open: false, type: '', item: null });
            if (editDialog.type === 'carrier') setSelectedCarriers([]);
            fetchLookups();
        } catch (error) {
            const err = error as { response?: { data?: { error?: string } } };
            showSnackbar(err.response?.data?.error || 'Failed to update', 'error');
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteDialog.item || !deleteDialog.type) return;
        try {
            await axios.delete(`/api/lookups/${deleteDialog.type}/${deleteDialog.item.id}`);
            showSnackbar('Deleted successfully', 'success');
            setDeleteDialog({ open: false, type: '', item: null });
            if (deleteDialog.type === 'carrier') {
                setSelectedCarriers(prev => prev.filter(id => id !== deleteDialog.item?.id));
            }
            fetchLookups();
        } catch (error) {
            const err = error as { response?: { data?: { error?: string } } };
            showSnackbar(err.response?.data?.error || 'Failed to delete (is it in use?)', 'error');
        }
    };

    const handleAddSave = async () => {
        if (!addName.trim() || !addDialog.type) return;
        try {
            await axios.post(`/api/lookups`, { type: addDialog.type, name: addName });
            showSnackbar('Added successfully', 'success');
            setAddDialog({ open: false, type: '' });
            setAddName('');
            fetchLookups();
        } catch (error) {
            const err = error as { response?: { data?: { error?: string } } };
            showSnackbar(err.response?.data?.error || 'Failed to add', 'error');
        }
    };

    const handleToggleCarrierSelection = (id: number) => {
        setSelectedCarriers(prev =>
            prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id],
        );
    };

    const handleSelectAllCarriers = (visibleItems: LookupItem[]) => {
        if (selectedCarriers.length === visibleItems.length) {
            setSelectedCarriers([]);
        } else {
            setSelectedCarriers(visibleItems.map(item => item.id));
        }
    };

    const handleMergeSave = async () => {
        if (!mergeTargetName.trim() || selectedCarriers.length === 0) return;
        setMerging(true);
        try {
            await axios.post('/api/lookups/carrier/merge', {
                sourceIds: selectedCarriers,
                targetName: mergeTargetName.trim(),
            });
            showSnackbar('Carriers merged successfully', 'success');
            setMergeDialog(false);
            setMergeTargetName('');
            setSelectedCarriers([]);
            fetchLookups();
        } catch (error) {
            const err = error as { response?: { data?: { error?: string } } };
            showSnackbar(err.response?.data?.error || 'Failed to merge carriers', 'error');
        } finally {
            setMerging(false);
        }
    };

    if (sessionStatus === 'loading' || (loading && session?.user?.role === Role.ADMIN)) {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: '#0f172a' }} /></Box>;
    }
    if (session?.user?.role !== Role.ADMIN) {
        return <Box sx={{ p: 4 }}><Alert severity="error">Access Denied. Admin privileges required.</Alert></Box>;
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f7f8f9', px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
            <Box sx={{ mb: 2.5, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', gap: 1.5, alignItems: { xs: 'flex-start', sm: 'center' } }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#111', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SettingsIcon sx={{ fontSize: 20 }} />
                    </Box>
                    <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.6px', lineHeight: 1.1, color: '#0f172a' }}>Lookups</Typography>
                        <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.2 }}>
                            {(lookups.statuses.length + lookups.types.length + lookups.carriers.length).toLocaleString()} entries
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <LookupCard
                    title="Tower Statuses"
                    type="status"
                    items={lookups.statuses}
                    selected={[]}
                    onToggleSelect={() => undefined}
                    onSelectAll={() => undefined}
                    onAdd={() => { setAddDialog({ open: true, type: 'status' }); setAddName(''); }}
                    onEdit={(item) => { setEditDialog({ open: true, type: 'status', item }); setEditName(item.name); }}
                    onDelete={(item) => setDeleteDialog({ open: true, type: 'status', item })}
                    search={search.status}
                    onSearch={(v) => setSearch(s => ({ ...s, status: v }))}
                />
                <LookupCard
                    title="Tower Types"
                    type="type"
                    items={lookups.types}
                    selected={[]}
                    onToggleSelect={() => undefined}
                    onSelectAll={() => undefined}
                    onAdd={() => { setAddDialog({ open: true, type: 'type' }); setAddName(''); }}
                    onEdit={(item) => { setEditDialog({ open: true, type: 'type', item }); setEditName(item.name); }}
                    onDelete={(item) => setDeleteDialog({ open: true, type: 'type', item })}
                    search={search.type}
                    onSearch={(v) => setSearch(s => ({ ...s, type: v }))}
                />
                <LookupCard
                    title="Carriers"
                    type="carrier"
                    items={lookups.carriers}
                    selected={selectedCarriers}
                    onToggleSelect={handleToggleCarrierSelection}
                    onSelectAll={handleSelectAllCarriers}
                    onAdd={() => { setAddDialog({ open: true, type: 'carrier' }); setAddName(''); }}
                    onEdit={(item) => { setEditDialog({ open: true, type: 'carrier', item }); setEditName(item.name); }}
                    onDelete={(item) => setDeleteDialog({ open: true, type: 'carrier', item })}
                    onMerge={() => { setMergeTargetName(''); setMergeDialog(true); }}
                    mergeCount={selectedCarriers.length}
                    search={search.carrier}
                    onSearch={(v) => setSearch(s => ({ ...s, carrier: v }))}
                />
            </Box>

            {/* Edit Dialog */}
            <Dialog open={editDialog.open} onClose={() => setEditDialog({ ...editDialog, open: false })} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Edit {editDialog.type}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth autoFocus margin="dense" label="Name" value={editName} onChange={e => setEditName(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setEditDialog({ ...editDialog, open: false })} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
                    <Button onClick={handleEditSave} variant="contained" disableElevation sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' } }}>Save</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ ...deleteDialog, open: false })} PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: '#475569' }}>
                        Are you sure you want to delete &quot;{deleteDialog.item?.name}&quot;? If it is currently assigned to any records, the deletion will be rejected.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} variant="contained" disableElevation sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' } }}>Delete</Button>
                </DialogActions>
            </Dialog>

            {/* Add Dialog */}
            <Dialog open={addDialog.open} onClose={() => setAddDialog({ ...addDialog, open: false })} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Add New {addDialog.type}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth autoFocus margin="dense" label="Name" value={addName} onChange={e => setAddName(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setAddDialog({ ...addDialog, open: false })} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
                    <Button onClick={handleAddSave} variant="contained" disableElevation sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' } }}>Add</Button>
                </DialogActions>
            </Dialog>

            {/* Merge Dialog */}
            <Dialog open={mergeDialog} onClose={() => setMergeDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Merge Carriers</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: '#475569', mb: 1 }}>
                        You are about to merge {selectedCarriers.length} carrier{selectedCarriers.length !== 1 ? 's' : ''}.
                        All towers currently assigned to these carriers will be reassigned to the new Target Carrier name below.
                        The original carrier records will be deleted if they differ from the target.
                    </Typography>
                    <TextField
                        fullWidth
                        autoFocus
                        margin="dense"
                        label="Target Carrier Name"
                        value={mergeTargetName}
                        onChange={e => setMergeTargetName(e.target.value)}
                        helperText="Provide the exact name for the merged carrier. If it already exists, towers will map to it. Otherwise, it will be created."
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setMergeDialog(false)} disabled={merging} sx={{ textTransform: 'none', fontWeight: 700 }}>Cancel</Button>
                    <Button onClick={handleMergeSave} variant="contained" disableElevation disabled={merging || !mergeTargetName.trim()} sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' } }}>
                        {merging ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Merge'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%', borderRadius: 2 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

interface LookupCardProps {
    title: string;
    type: LookupType;
    items: LookupItem[];
    selected: number[];
    onToggleSelect: (id: number) => void;
    onSelectAll: (visibleItems: LookupItem[]) => void;
    onAdd: () => void;
    onEdit: (item: LookupItem) => void;
    onDelete: (item: LookupItem) => void;
    onMerge?: () => void;
    mergeCount?: number;
    search: string;
    onSearch: (v: string) => void;
}

function LookupCard({ title, type, items, selected, onToggleSelect, onSelectAll, onAdd, onEdit, onDelete, onMerge, mergeCount = 0, search, onSearch }: LookupCardProps) {
    const isCarrier = type === 'carrier';
    const q = search.trim().toLowerCase();
    const visible = q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
    const allSelected = visible.length > 0 && visible.every(i => selected.includes(i.id));
    const indeterminate = selected.length > 0 && !allSelected;

    return (
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: 'white', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box sx={{ p: 1.8, borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                        {isCarrier && (
                            <Checkbox
                                size="small"
                                edge="start"
                                checked={allSelected}
                                indeterminate={indeterminate}
                                onChange={() => onSelectAll(visible)}
                                disabled={visible.length === 0}
                                sx={{ p: 0.5, color: '#94a3b8', '&.Mui-checked': { color: '#10b981' } }}
                            />
                        )}
                        <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{title}</Typography>
                        <Box sx={{ px: 0.8, py: 0.2, bgcolor: '#f1f5f9', color: '#475569', borderRadius: 99, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
                            {items.length.toLocaleString()}
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.8 }}>
                        {isCarrier && mergeCount > 0 && (
                            <Button size="small" onClick={onMerge} startIcon={<MergeTypeIcon sx={{ fontSize: 15 }} />} variant="contained" disableElevation sx={{ textTransform: 'none', fontWeight: 800, fontSize: 12, borderRadius: 1.5, bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' } }}>
                                Merge {mergeCount}
                            </Button>
                        )}
                        <Button size="small" onClick={onAdd} startIcon={<AddIcon sx={{ fontSize: 15 }} />} variant="outlined" sx={{ textTransform: 'none', fontWeight: 800, fontSize: 12, borderRadius: 1.5, borderColor: '#e2e8f0', color: '#0f172a', bgcolor: 'white', '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' } }}>
                            Add
                        </Button>
                    </Box>
                </Box>
                <TextField
                    size="small"
                    value={search}
                    onChange={e => onSearch(e.target.value)}
                    placeholder={`Filter ${title.toLowerCase()}…`}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, fontSize: 13, bgcolor: '#f8fafc' } }}
                />
            </Box>

            <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
                {visible.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No entries found.</Box>
                ) : visible.map((item) => {
                    const isSelected = selected.includes(item.id);
                    return (
                        <Box
                            key={item.id}
                            onClick={isCarrier ? () => onToggleSelect(item.id) : undefined}
                            sx={{
                                px: 1.6, py: 1.2,
                                display: 'flex', alignItems: 'center', gap: 1.2,
                                borderBottom: '1px solid #f1f5f9',
                                cursor: isCarrier ? 'pointer' : 'default',
                                bgcolor: isSelected ? '#ecfdf5' : 'transparent',
                                transition: 'background 0.12s',
                                '&:hover': { bgcolor: isSelected ? '#ecfdf5' : '#f8fafc' },
                                '&:last-of-type': { borderBottom: 'none' },
                            }}
                        >
                            {isCarrier && (
                                <Checkbox size="small" checked={isSelected} tabIndex={-1} disableRipple sx={{ p: 0, color: '#94a3b8', '&.Mui-checked': { color: '#10b981' } }} />
                            )}
                            <Typography sx={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0f172a', minWidth: 0 }} noWrap>
                                {item.name}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>ID {item.id}</Typography>
                            <Box sx={{ display: 'flex', gap: 0.2, ml: 0.5 }}>
                                <IconButton size="small" onClick={() => onEdit(item)} aria-label="edit" sx={{ color: '#64748b', '&:hover': { color: '#0f172a', bgcolor: '#f1f5f9' } }}>
                                    <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => onDelete(item)} aria-label="delete" sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }}>
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
}
