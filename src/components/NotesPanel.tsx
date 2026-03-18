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
                    No notes yet. Click "Add Note" to create one.
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
                                            {note.author?.name || 'Unknown User'} - {formatDate(note.createdAt)}
                                        </Typography>
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
