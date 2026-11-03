'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

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
    const inputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/towers/' + towerId + '/documents');
            if (!res.ok) throw new Error('Request failed');
            setDocuments(await res.json());
            setStatus('ready');
        } catch (loadError) {
            console.error('Failed to load documents:', loadError);
            setStatus('error');
        }
    }, [towerId]);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/towers/' + towerId + '/documents')
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Request failed'))))
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
    }, [towerId]);

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
            await load();
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleDelete = async (document: TowerDocument) => {
        if (!window.confirm('Delete ' + document.fileName + '?')) return;
        try {
            const res = await fetch('/api/documents/' + document.id, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Delete failed');
            }
            await load();
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'Delete failed');
        }
    };

    const handlePreview = (document: TowerDocument) => {
        setPreview(document);
        // Opening counts as a view, so refresh the metadata behind the dialog.
        window.setTimeout(() => { void load(); }, 1500);
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
                            <Tooltip title={document.mimeType === 'application/pdf' ? 'Open in new tab' : 'Download'}>
                                <IconButton
                                    size="small"
                                    component="a"
                                    href={'/api/documents/' + document.id + '/file'}
                                    target="_blank"
                                    rel="noopener"
                                >
                                    {document.mimeType === 'application/pdf'
                                        ? <OpenInNewIcon fontSize="small" />
                                        : <DownloadIcon fontSize="small" />}
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => handleDelete(document)}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                </Paper>
            ))}

            <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} maxWidth="lg" fullWidth>
                <DialogTitle sx={{ wordBreak: 'break-all' }}>{preview?.fileName}</DialogTitle>
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
