'use client';
import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, Paper, List, ListItem, ListItemText, IconButton,
    Divider, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
    Alert, Snackbar, CircularProgress, Checkbox, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import MergeTypeIcon from '@mui/icons-material/MergeType';
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
        carriers: [] as LookupItem[]
    });
    const [loading, setLoading] = useState(true);

    const [editDialog, setEditDialog] = useState<{ open: boolean, type: LookupType | '', item: LookupItem | null }>({
        open: false, type: '', item: null
    });
    const [editName, setEditName] = useState('');
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean, type: LookupType | '', item: LookupItem | null }>({
        open: false, type: '', item: null
    });

    const [addDialog, setAddDialog] = useState<{ open: boolean, type: LookupType | '' }>({
        open: false, type: ''
    });
    const [addName, setAddName] = useState('');

    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    // Merging states
    const [selectedCarriers, setSelectedCarriers] = useState<number[]>([]);
    const [mergeDialog, setMergeDialog] = useState(false);
    const [mergeTargetName, setMergeTargetName] = useState('');
    const [merging, setMerging] = useState(false);

    const fetchLookups = async () => {
        try {
            const { data } = await axios.get('/api/towers?distinct=lookups');
            setLookups({
                statuses: data.statuses || [],
                types: data.types || [],
                carriers: data.carriers || []
            });
        } catch (error) {
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
            // Clear selections in case a selected item was just edited
            if (editDialog.type === 'carrier') setSelectedCarriers([]);
            fetchLookups();
        } catch (error: any) {
            showSnackbar(error.response?.data?.error || 'Failed to update', 'error');
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteDialog.item || !deleteDialog.type) return;
        try {
            await axios.delete(`/api/lookups/${deleteDialog.type}/${deleteDialog.item.id}`);
            showSnackbar('Deleted successfully', 'success');
            setDeleteDialog({ open: false, type: '', item: null });
            // Remove from selection if it was deleted
            if (deleteDialog.type === 'carrier') {
                setSelectedCarriers(prev => prev.filter(id => id !== deleteDialog.item?.id));
            }
            fetchLookups();
        } catch (error: any) {
            showSnackbar(error.response?.data?.error || 'Failed to delete (is it in use?)', 'error');
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
        } catch (error: any) {
            showSnackbar(error.response?.data?.error || 'Failed to add', 'error');
        }
    };

    const handleToggleCarrierSelection = (id: number) => {
        setSelectedCarriers(prev =>
            prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
        );
    };

    const handleSelectAllCarriers = (visibleItems: LookupItem[]) => {
        if (selectedCarriers.length === visibleItems.length) {
            setSelectedCarriers([]); // Deselect all
        } else {
            setSelectedCarriers(visibleItems.map(item => item.id)); // Select all
        }
    };

    const handleMergeSave = async () => {
        if (!mergeTargetName.trim() || selectedCarriers.length === 0) return;
        setMerging(true);
        try {
            await axios.post('/api/lookups/carrier/merge', {
                sourceIds: selectedCarriers,
                targetName: mergeTargetName.trim()
            });
            showSnackbar('Carriers merged successfully', 'success');
            setMergeDialog(false);
            setMergeTargetName('');
            setSelectedCarriers([]);
            fetchLookups();
        } catch (error: any) {
            showSnackbar(error.response?.data?.error || 'Failed to merge carriers', 'error');
        } finally {
            setMerging(false);
        }
    };

    const renderList = (title: string, items: LookupItem[], type: LookupType) => {
        const isCarrier = type === 'carrier';

        return (
            <Paper variant="outlined" sx={{ mb: 4, ml: 2, mr: 2 }}>
                <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {isCarrier && (
                            <Checkbox
                                edge="start"
                                checked={items.length > 0 && selectedCarriers.length === items.length}
                                indeterminate={selectedCarriers.length > 0 && selectedCarriers.length < items.length}
                                onChange={() => handleSelectAllCarriers(items)}
                                disabled={items.length === 0}
                                sx={{ mr: 1 }}
                            />
                        )}
                        <Typography variant="h6">{title}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {isCarrier && selectedCarriers.length > 0 && (
                            <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                startIcon={<MergeTypeIcon />}
                                onClick={() => { setMergeTargetName(''); setMergeDialog(true); }}
                            >
                                Merge ({selectedCarriers.length})
                            </Button>
                        )}
                        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => { setAddDialog({ open: true, type }); setAddName(''); }}>
                            Add New
                        </Button>
                    </Box>
                </Box>
                <List sx={{ p: 0 }}>
                    {items.length === 0 ? (
                        <ListItem><ListItemText secondary="No entries found." /></ListItem>
                    ) : items.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <ListItem
                                disablePadding={isCarrier}
                                secondaryAction={
                                    <Box>
                                        <IconButton edge="end" aria-label="edit" onClick={() => {
                                            setEditDialog({ open: true, type, item });
                                            setEditName(item.name);
                                        }} sx={{ mr: 1 }}>
                                            <EditIcon />
                                        </IconButton>
                                        <IconButton edge="end" aria-label="delete" color="error" onClick={() => {
                                            setDeleteDialog({ open: true, type, item });
                                        }}>
                                            <DeleteIcon />
                                        </IconButton>
                                    </Box>
                                }>
                                {isCarrier ? (
                                    <ListItem
                                        dense
                                        onClick={() => handleToggleCarrierSelection(item.id)}
                                        sx={{ pr: 12, cursor: 'pointer' }} // Ensure text doesn't overlap with action buttons
                                    >
                                        <Checkbox
                                            edge="start"
                                            checked={selectedCarriers.includes(item.id)}
                                            tabIndex={-1}
                                            disableRipple
                                        />
                                        <ListItemText primary={item.name} secondary={`ID: ${item.id}`} />
                                    </ListItem>
                                ) : (
                                    <ListItemText primary={item.name} secondary={`ID: ${item.id}`} />
                                )}
                            </ListItem>
                            {index < items.length - 1 && <Divider />}
                        </React.Fragment>
                    ))}
                </List>
            </Paper>
        );
    };

    if (sessionStatus === 'loading' || (loading && session?.user?.role === Role.ADMIN)) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    if (session?.user?.role !== Role.ADMIN) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Alert severity="error">Access Denied. Admin privileges required.</Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4, height: '100%', overflowY: 'auto' }}>
            <Box sx={{ ml: 2, mb: 4 }}>
                <Typography variant="h4" gutterBottom fontWeight="bold">Lookups Management</Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    Manage Tower Statuses, Types, and Carriers below. Note that deleting an item currently assigned to a tower will fail to prevent data errors.
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {renderList('Tower Statuses', lookups.statuses, 'status')}
                    {renderList('Tower Types', lookups.types, 'type')}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {renderList('Carriers', lookups.carriers, 'carrier')}
                </Box>
            </Box>

            {/* Edit Dialog */}
            <Dialog open={editDialog.open} onClose={() => setEditDialog({ ...editDialog, open: false })} maxWidth="sm" fullWidth>
                <DialogTitle>Edit {editDialog.type}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth autoFocus margin="dense" label="Name" value={editName} onChange={e => setEditName(e.target.value)} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialog({ ...editDialog, open: false })}>Cancel</Button>
                    <Button onClick={handleEditSave} variant="contained">Save</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete "{deleteDialog.item?.name}"? If it is currently assigned to any records, the deletion will be rejected.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>

            {/* Add Dialog */}
            <Dialog open={addDialog.open} onClose={() => setAddDialog({ ...addDialog, open: false })} maxWidth="sm" fullWidth>
                <DialogTitle>Add New {addDialog.type}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth autoFocus margin="dense" label="Name" value={addName} onChange={e => setAddName(e.target.value)} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialog({ ...addDialog, open: false })}>Cancel</Button>
                    <Button onClick={handleAddSave} variant="contained">Add</Button>
                </DialogActions>
            </Dialog>

            {/* Merge Dialog */}
            <Dialog open={mergeDialog} onClose={() => setMergeDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Merge Carriers</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>
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
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setMergeDialog(false)} disabled={merging}>Cancel</Button>
                    <Button onClick={handleMergeSave} variant="contained" color="primary" disabled={merging || !mergeTargetName.trim()}>
                        {merging ? <CircularProgress size={24} /> : 'Merge'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}
