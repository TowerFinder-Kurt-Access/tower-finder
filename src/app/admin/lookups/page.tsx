'use client';
import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, Paper, List, ListItem, ListItemText, IconButton,
    Divider, Grid, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
    Alert, Snackbar, CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';

interface LookupItem {
    id: number;
    name: string;
}

type LookupType = 'status' | 'type' | 'carrier' | 'licensee';

export default function LookupsManagementPage() {
    const [lookups, setLookups] = useState({
        statuses: [] as LookupItem[],
        types: [] as LookupItem[],
        carriers: [] as LookupItem[],
        licensees: [] as LookupItem[]
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

    const fetchLookups = async () => {
        try {
            const { data } = await axios.get('/api/towers?distinct=lookups');
            setLookups({
                statuses: data.statuses || [],
                types: data.types || [],
                carriers: data.carriers || [],
                licensees: data.licensees || []
            });
        } catch (error) {
            showSnackbar('Failed to fetch lookups', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLookups();
    }, []);

    const showSnackbar = (message: string, severity: 'success' | 'error') => {
        setSnackbar({ open: true, message, severity });
    };

    const handleEditSave = async () => {
        if (!editDialog.item || !editName.trim()) return;
        try {
            await axios.put(`/api/lookups/${editDialog.type}/${editDialog.item.id}`, { name: editName });
            showSnackbar('Updated successfully', 'success');
            setEditDialog({ open: false, type: '', item: null });
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

    const renderList = (title: string, items: LookupItem[], type: LookupType) => (
        <Paper variant="outlined" sx={{ mb: 4, ml: 2, mr: 2 }}>
            <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">{title}</Typography>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => { setAddDialog({ open: true, type }); setAddName(''); }}>
                    Add New
                </Button>
            </Box>
            <List sx={{ p: 0 }}>
                {items.length === 0 ? (
                    <ListItem><ListItemText secondary="No entries found." /></ListItem>
                ) : items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <ListItem secondaryAction={
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
                            <ListItemText primary={item.name} secondary={`ID: ${item.id}`} />
                        </ListItem>
                        {index < items.length - 1 && <Divider />}
                    </React.Fragment>
                ))}
            </List>
        </Paper>
    );

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    return (
        <Container maxWidth="lg" sx={{ py: 4, height: '100%', overflowY: 'auto' }}>
            <Box sx={{ ml: 2, mb: 4 }}>
                <Typography variant="h4" gutterBottom fontWeight="bold">Lookups Management</Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    Manage Tower Statuses, Types, Carriers, and Licensees below. Note that deleting an item currently assigned to a tower will fail to prevent data errors.
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {renderList('Tower Statuses', lookups.statuses, 'status')}
                    {renderList('Tower Types', lookups.types, 'type')}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {renderList('Carriers', lookups.carriers, 'carrier')}
                    {renderList('Licensees', lookups.licensees, 'licensee')}
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

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}
