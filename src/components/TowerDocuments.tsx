'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Paper from '@mui/material/Paper';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DescriptionIcon from '@mui/icons-material/Description';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';

interface TowerDocument {
    id: number;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    lastOpenedAt: string | null;
    openCount: number;
    uploadedBy: { id: number; name: string } | null;
    lastOpenedBy: { id: number; name: string } | null;
}

interface TowerDocumentsProps {
    towerId: number;
}

const ACCEPT = '.pdf,.doc,.docx,.docm';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatWhen(value: string | null): string {
    if (!value) return 'Never';
    return new Date(value).toLocaleString();
}

export default function TowerDocuments({ towerId }: TowerDocumentsProps) {
    const [documents, setDocuments] = useState<TowerDocument[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<TowerDocument | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<TowerDocument | null>(null);
    const [pendingDownload, setPendingDownload] = useState<TowerDocument | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/towers/' + towerId + '/documents')
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Documents request failed with status ' + res.status))))
            .then((items: TowerDocument[]) => {
                if (cancelled) return;
                setDocuments(items);
                setStatus('ready');
            })
            .catch((loadError) => {
                if (cancelled) return;
                console.error('Failed to load documents:', loadError);
                setStatus('error');
            });
        return () => { cancelled = true; };
    }, [towerId, reloadKey]);

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError('');
        setUploading(true);
        const body = new FormData();
        body.append('file', file);

        try {
            const res = await fetch('/api/towers/' + towerId + '/documents', { method: 'POST', body });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Upload failed');
            }
            setReloadKey((key) => key + 1);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleDelete = (document: TowerDocument) => {
        setPendingDelete(document);
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const document = pendingDelete;
        setError('');
        setDeletingId(document.id);
        try {
            const res = await fetch('/api/documents/' + document.id, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Delete failed');
            }
            setPendingDelete(null);
            setReloadKey((key) => key + 1);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Delete failed');
            setPendingDelete(null);
        } finally {
            setDeletingId(null);
        }
    };

    const confirmDownload = () => {
        if (!pendingDownload) return;
        const link = window.document.createElement('a');
        link.href = '/api/documents/' + pendingDownload.id + '/file?download=1';
        link.download = pendingDownload.fileName;
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        setPendingDownload(null);
        window.setTimeout(() => { setReloadKey((key) => key + 1); }, 1500);
    };

    const handlePreview = (document: TowerDocument) => {
        setPreview(document);
        // Opening counts as a view, so refresh the metadata behind the dialog.
        window.setTimeout(() => { setReloadKey((key) => key + 1); }, 1500);
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <DescriptionIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Documents
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                >
                    {uploading ? 'Uploading...' : 'Upload file'}
                </Button>
                <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={handleUpload} />
            </Box>

            <Typography variant="caption" color="text.secondary">
                PDF, DOC, DOCX or DOCM. Up to 10 MB per file.
            </Typography>

            <Divider sx={{ my: 2 }} />

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {status === 'loading' && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                </Box>
            )}

            {status === 'error' && (
                <Typography variant="body2" color="error">
                    Could not load the documents for this tower.
                </Typography>
            )}

            {status === 'ready' && documents.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    No documents yet. Upload the first one.
                </Typography>
            )}

            {documents.map((document) => (
                <Paper key={document.id} variant="outlined" sx={{ p: 1.5, mb: 1, bgcolor: '#fafafa' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <DescriptionIcon fontSize="small" color="action" />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                                {document.fileName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {formatBytes(document.sizeBytes)} · uploaded by {document.uploadedBy?.name ?? 'Unknown'} on {formatWhen(document.uploadedAt)}
                            </Typography>
                            <br />
                            <Typography variant="caption" color="text.secondary">
                                Last opened {formatWhen(document.lastOpenedAt)}
                                {document.lastOpenedBy?.name ? ' by ' + document.lastOpenedBy.name : ''}
                                {document.openCount > 0 ? ' · ' + document.openCount + ' view' + (document.openCount === 1 ? '' : 's') : ''}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {document.mimeType === 'application/pdf' && (
                                <Tooltip title="Preview">
                                    <IconButton size="small" onClick={() => handlePreview(document)}>
                                        <VisibilityIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title="Download">
                                <IconButton size="small" onClick={() => setPendingDownload(document)}>
                                    <DownloadIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                                <span>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => handleDelete(document)}
                                        disabled={deletingId === document.id}
                                    >
                                        {deletingId === document.id
                                            ? <CircularProgress size={16} color="inherit" />
                                            : <DeleteIcon fontSize="small" />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Box>
                    </Box>
                </Paper>
            ))}

            <Dialog open={Boolean(pendingDownload)} onClose={() => setPendingDownload(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Download document?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                        {pendingDownload?.fileName} will be saved to your device.
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        {pendingDownload ? formatBytes(pendingDownload.sizeBytes) : ''}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPendingDownload(null)}>Cancel</Button>
                    <Button variant="contained" onClick={confirmDownload} startIcon={<DownloadIcon />}>
                        Download
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete document?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                        {pendingDelete?.fileName} will be removed for everyone. This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPendingDelete(null)} disabled={deletingId !== null}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmDelete}
                        disabled={deletingId !== null}
                        startIcon={deletingId !== null ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
                    >
                        {deletingId !== null ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} maxWidth="lg" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6, position: 'relative' }}>
                    <Box component="span" sx={{ wordBreak: 'break-all' }}>{preview?.fileName}</Box>
                    <IconButton
                        aria-label="Close preview"
                        onClick={() => setPreview(null)}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0, height: '75vh' }}>
                    {preview && (
                        <Box
                            component="iframe"
                            title={preview.fileName}
                            src={'/api/documents/' + preview.id + '/file'}
                            sx={{ width: '100%', height: '100%', border: 0 }}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreview(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
