'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import {
    Box,
    Typography,
    Button,
    TextField,
    Card,
    CardContent,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import Divider from '@mui/material/Divider';

interface NoteHistory {
    id: number;
    content: string;
    initials: string | null;
    updatedAt: string;
}

interface Note {
    id: number;
    content: string;
    initials?: string | null;
    author: {
        id: number;
        name: string | null;
        email: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
    history?: NoteHistory[];
}

interface NotesPanelProps {
    towerId: number;
    notes: Note[];
    onNotesChange: () => void;
}

export default function NotesPanel({ towerId, notes, onNotesChange }: NotesPanelProps) {
    const { data: session } = useSession();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<Note | null>(null);
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState<number | null>(null);

    const handleOpenDialog = (note?: Note) => {
        if (note) {
            setEditingNote(note);
            setContent(note.content || '');
        } else {
            setEditingNote(null);
            setContent('');
        }
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingNote(null);
        setContent('');
    };

    const handleSave = async () => {
        if (!(content || '').trim()) return;

        setSaving(true);
        try {
            if (editingNote) {
                // Update existing note
                await fetch(`/api/towers/${towerId}/notes/${editingNote.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: (content || '').trim() })
                });
            } else {
                // Create new note
                await fetch(`/api/towers/${towerId}/notes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: (content || '').trim() })
                });
            }

            handleCloseDialog();
            onNotesChange();
        } catch (error) {
            console.error('Error saving note:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (noteId: number) => {
        if (!confirm('Are you sure you want to delete this note?')) return;

        setDeleting(noteId);
        try {
            await fetch(`/api/towers/${towerId}/notes/${noteId}`, {
                method: 'DELETE'
            });
            onNotesChange();
        } catch (error) {
            console.error('Error deleting note:', error);
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                    Notes ({notes.length})
                </Typography>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    Add Note
                </Button>
            </Box>

            {notes.length === 0 ? (
                <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No notes yet. Click &quot;Add Note&quot; to create one.
                </Typography>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {notes.map((note) => (
                        <Card key={note.id} variant="outlined" sx={{ bgcolor: 'grey.50' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                                            {note.content}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {note.initials ? `[${note.initials}] ` : ''}
                                            {note.author?.name || 'Unknown User'} - {formatDate(note.createdAt)}
                                        </Typography>

                                        {note.history && note.history.length > 1 && (
                                            <Box sx={{ mt: 1 }}>
                                                <Button
                                                    size="small"
                                                    startIcon={showHistory === note.id ? <ExpandLessIcon /> : <HistoryIcon sx={{ fontSize: '1rem' }} />}
                                                    onClick={() => setShowHistory(showHistory === note.id ? null : note.id)}
                                                    sx={{ fontSize: '0.65rem', py: 0, minWidth: 0, textTransform: 'none' }}
                                                >
                                                    {showHistory === note.id ? 'Hide History' : `Show History (${note.history.length})`}
                                                </Button>

                                                {showHistory === note.id && (
                                                    <Box sx={{ pl: 2, borderLeft: '2px solid #e0e0e0', mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                        {note.history.map((h, i) => (
                                                            <Box key={h.id} sx={{ opacity: i === 0 ? 1 : 0.7 }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', fontSize: '0.7rem' }}>
                                                                    {h.initials ? `[${h.initials}] ` : ''} {formatDate(h.updatedAt)} {i === 0 ? '(Current)' : ''}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                                                                    {h.content}
                                                                </Typography>
                                                                {i < note.history!.length - 1 && <Divider sx={{ my: 0.5, borderStyle: 'dotted' }} />}
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleOpenDialog(note)}
                                            disabled={deleting === note.id}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDelete(note.id)}
                                            disabled={deleting === note.id}
                                        >
                                            {deleting === note.id ? (
                                                <CircularProgress size={16} />
                                            ) : (
                                                <DeleteIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    ))}
                </Box>
            )}

            {/* Add/Edit Note Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingNote ? 'Edit Note' : 'Add Note'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        label="Note"
                        multiline
                        rows={4}
                        fullWidth
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        sx={{ mt: 1 }}
                        placeholder="Enter your note here..."
                    />
                    {session?.user?.name && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Posting as: {session.user.name}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        variant="contained"
                        disabled={saving || !(content || '').trim()}
                    >
                        {saving ? <CircularProgress size={20} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
