'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Divider,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    CircularProgress,
    TextField,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Chip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PersonIcon from '@mui/icons-material/Person';
import NotesPanel from './NotesPanel';

interface Note {
    id: number;
    content: string;
    author: {
        id: number;
        name: string | null;
        email: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
}

interface Tower {
    id: number;
    lat: number;
    lon: number;
    type?: { name: string } | string;
    status?: { id: number; name: string };
    legacyStatus?: string;
    carrier?: { name: string };
    source?: string;
    parcel?: {
        address?: string;
        streetNumber?: string;
        streetName?: string;
        streetType?: string;
        streetDir?: string;
        unit?: string;
        postalCode?: string;
        cityRaw?: string;
        stateRaw?: string;
        provinceRaw?: string;
        city?: { name: string } | string;
        province?: { name: string } | string;
        state?: string;
        zip?: string;
        county?: string;
        parcelId?: string;
        dataSource?: string;
        rawData?: any;
        owner?: {
            name?: string;
            address?: string;
            type?: string;
        };
    };
    notes?: Note[];
}

interface LookupItem {
    id: number;
    name: string;
}

interface TowerDetailDrawerProps {
    open: boolean;
    tower: Tower | null;
    onClose: () => void;
    onTowerUpdate: () => void;
}

const AUTHOR_STORAGE_KEY = 'tower-finder-note-author';

export default function TowerDetailDrawer({
    open,
    tower,
    onClose,
    onTowerUpdate
}: TowerDetailDrawerProps) {
    const [statusLabel, setStatusLabel] = useState(tower?.status?.name || tower?.legacyStatus || '');
    const [selectedStatusId, setSelectedStatusId] = useState<number | ''>(tower?.status?.id || '');
    const [saving, setSaving] = useState(false);
    const [notes, setNotes] = useState<Note[]>(tower?.notes || []);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [statuses, setStatuses] = useState<LookupItem[]>([]);

    // Status change note dialog
    const [statusNoteDialogOpen, setStatusNoteDialogOpen] = useState(false);
    const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);
    const [statusNote, setStatusNote] = useState('');

    // Sync status and notes when tower changes
    useEffect(() => {
        if (tower) {
            setStatusLabel(tower.status?.name || tower.legacyStatus || '');
            setSelectedStatusId(tower.status?.id || '');
            setNotes(tower.notes || []);
        }
    }, [tower]);

    // Fetch statuses if we haven't
    useEffect(() => {
        if (open && statuses.length === 0) {
            fetch('/api/towers?distinct=lookups')
                .then(r => r.json())
                .then(data => {
                    if (data.statuses) {
                        setStatuses(data.statuses);
                    }
                })
                .catch(err => console.error(err));
        }
    }, [open]);

    const fetchNotes = async () => {
        if (!tower) return;
        setLoadingNotes(true);
        try {
            const res = await fetch(`/api/towers/${tower.id}/notes`);
            const data = await res.json();
            setNotes(data);
        } catch (error) {
            console.error('Error fetching notes:', error);
        } finally {
            setLoadingNotes(false);
        }
    };

    const handleStatusChange = (event: SelectChangeEvent) => {
        const val = Number(event.target.value);
        setPendingStatusId(val);
        setStatusNote('');
        setStatusNoteDialogOpen(true);
    };

    const handleStatusSave = async (addNote: boolean) => {
        if (!tower || !pendingStatusId) return;

        setSaving(true);
        try {
            const statusName = statuses.find(s => s.id === pendingStatusId)?.name || 'Unknown';
            // Update status
            await fetch(`/api/towers/${tower.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statusId: pendingStatusId })
            });

            // Optionally add a note about the status change
            if (addNote && statusNote.trim()) {
                const noteContent = `[Status changed to "${statusName}"]\n${statusNote.trim()}`;
                await fetch(`/api/towers/${tower.id}/notes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: noteContent
                    })
                });
            }

            setSelectedStatusId(pendingStatusId);
            setStatusLabel(statusName);
            setStatusNoteDialogOpen(false);
            onTowerUpdate();
            fetchNotes();
        } catch (error) {
            console.error('Error updating status:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleNotesChange = () => {
        fetchNotes();
        onTowerUpdate();
    };

    if (!tower) return null;

    return (
        <>
            <Drawer
                anchor="right"
                open={open}
                onClose={onClose}
                sx={{
                    '& .MuiDrawer-paper': {
                        width: { xs: '100%', sm: 450 },
                        p: 0
                    }
                }}
            >
                {/* Header */}
                <Box sx={{
                    p: 2,
                    bgcolor: 'primary.main',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Typography variant="h6">
                        Tower #{tower.id}
                    </Typography>
                    <IconButton onClick={onClose} sx={{ color: 'white' }}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                {/* Content */}
                <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
                    {/* Status Section */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            STATUS
                        </Typography>
                        <FormControl fullWidth size="small">
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={String(selectedStatusId)}
                                label="Status"
                                onChange={handleStatusChange}
                                disabled={saving}
                            >
                                {statuses.map((option) => (
                                    <MenuItem key={option.id} value={String(option.id)}>
                                        {option.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {statusLabel && (
                            <Chip
                                label={statusLabel}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ mt: 1 }}
                            />
                        )}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Tower Info Section */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            <LocationOnIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                            TOWER INFO
                        </Typography>
                        <Box sx={{ pl: 1 }}>
                            <Typography variant="body2"><strong>Type:</strong> {(typeof tower.type === 'object' ? tower.type?.name : tower.type) || 'Unknown'}</Typography>

                            {tower.carrier && <Typography variant="body2"><strong>Carrier:</strong> {typeof tower.carrier === 'object' ? tower.carrier?.name : tower.carrier}</Typography>}
                            <Typography variant="body2"><strong>Coordinates:</strong> {tower.lat.toFixed(6)}, {tower.lon.toFixed(6)}</Typography>
                            <Typography variant="body2"><strong>Source:</strong> {tower.source || 'N/A'}</Typography>
                            <Button
                                variant="outlined"
                                color="primary"
                                fullWidth
                                size="small"
                                startIcon={<LocationOnIcon />}
                                onClick={() => {
                                    const url = `https://webmap.onxmaps.com/hunt/map/query/${tower.lat},${tower.lon},14.57/overview#15.5/${tower.lat}/${tower.lon}`;
                                    window.open(url, '_blank');
                                }}
                                sx={{ mt: 1.5, borderColor: '#5c7c3c', color: '#5c7c3c', '&:hover': { borderColor: '#4a6430', bgcolor: 'rgba(92, 124, 60, 0.04)' } }}
                            >
                                Open in onX Maps
                            </Button>
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Parcel & Owner Section */}
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            <PersonIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                            PARCEL & PROPERTY OWNER
                        </Typography>
                        <Box sx={{ pl: 1 }}>
                            {tower.parcel ? (
                                <>
                                    <Typography variant="body2">
                                        <strong>Address:</strong> {tower.parcel.address || 'N/A'}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>City:</strong> {(typeof tower.parcel.city === 'object' ? tower.parcel.city?.name : tower.parcel.city) || tower.parcel.cityRaw || 'N/A'}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Province:</strong> {(typeof tower.parcel.province === 'object' ? tower.parcel.province?.name : tower.parcel.province) || tower.parcel.provinceRaw || tower.parcel.stateRaw || tower.parcel.state || 'N/A'}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Postal Code:</strong> {tower.parcel.postalCode || tower.parcel.zip || 'N/A'}
                                    </Typography>
                                    {tower.parcel.county && (
                                        <Typography variant="body2">
                                            <strong>County:</strong> {tower.parcel.county}
                                        </Typography>
                                    )}
                                    <Typography variant="body2">
                                        <strong>Parcel ID / PIN:</strong> {tower.parcel.parcelId || 'N/A'}
                                    </Typography>
                                    {tower.parcel.rawData && (tower.parcel.rawData as any).parcelDesignator && (
                                        <Typography variant="body2">
                                            <strong>Designator:</strong> {(tower.parcel.rawData as any).parcelDesignator}
                                        </Typography>
                                    )}
                                    <Typography variant="body2">
                                        <strong>Data Source:</strong> {tower.parcel.dataSource || tower.source || 'N/A'}
                                    </Typography>
                                    {tower.parcel.owner && (
                                        <>
                                            <Divider sx={{ my: 1 }} />
                                            <Typography variant="body2">
                                                <strong>Property Owner:</strong> {tower.parcel.owner.name || 'N/A'}
                                            </Typography>
                                            <Typography variant="body2">
                                                <strong>Property Owner Type:</strong> {tower.parcel.owner.type || 'N/A'}
                                            </Typography>
                                            <Typography variant="body2">
                                                <strong>Property Owner Address:</strong> {tower.parcel.owner.address || 'N/A'}
                                            </Typography>
                                        </>
                                    )}
                                </>
                            ) : (
                                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                    No parcel data. Use "Lookup Property Owner" to fetch parcel information.
                                </Typography>
                            )}
                        </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Notes Section */}
                    {loadingNotes ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : (
                        <NotesPanel
                            towerId={tower.id}
                            notes={notes}
                            onNotesChange={handleNotesChange}
                        />
                    )}
                </Box>
            </Drawer>

            {/* Status Change Note Dialog */}
            <Dialog
                open={statusNoteDialogOpen}
                onClose={() => !saving && setStatusNoteDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    Change Status to "{statuses.find(s => s.id === pendingStatusId)?.name || 'Unknown'}"
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Would you like to add a note about this status change? (Optional)
                    </Typography>
                    <TextField
                        label="Note (optional)"
                        multiline
                        rows={3}
                        fullWidth
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value)}
                        placeholder="e.g., Spoke with property owner, they are interested..."
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setStatusNoteDialogOpen(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => handleStatusSave(false)}
                        disabled={saving}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save Without Note'}
                    </Button>
                    <Button
                        onClick={() => handleStatusSave(true)}
                        variant="contained"
                        disabled={saving}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save With Note'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
