import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography, Box, Link, CircularProgress, Alert
} from '@mui/material';
import axios from 'axios';

interface PromoteLeadDialogProps {
    open: boolean;
    lead: any; // The lead being promoted
    onClose: () => void;
    onSuccess: (leadId: number) => void;
}

export default function PromoteLeadDialog({ open, lead, onClose, onSuccess }: PromoteLeadDialogProps) {
    const [googleMapsUrl, setGoogleMapsUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setGoogleMapsUrl('');
            setError(null);
            setIsSubmitting(false);
        }
    }, [open, lead]);

    if (!lead) return null;

    const handlePromote = async () => {
        if (!googleMapsUrl) {
            setError('Street View URL is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await axios.post(`/api/tower-leads/${lead.id}/promote`, {
                googleMapsUrl
            });
            onSuccess(lead.id);
            onClose();
        } catch (err: any) {
            console.error('Failed to promote lead:', err);
            setError(err.response?.data?.message || err.response?.data?.error || 'Failed to promote lead');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add Tower Lead to Towers</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Please verify the tower location using satellite view and provide a Street View URL to confirm.
                    </Typography>

                    <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                        <Typography variant="subtitle2">Lead Details:</Typography>
                        <Typography variant="body2"><strong>ID:</strong> {lead.id}</Typography>
                        <Typography variant="body2"><strong>Coordinates:</strong> {lead.lat.toFixed(6)}, {lead.lon.toFixed(6)}</Typography>
                        <Typography variant="body2"><strong>Source:</strong> {lead.source}</Typography>
                    </Box>

                    <Button
                        variant="outlined"
                        fullWidth
                        href={`https://www.google.com/maps/@${lead.lat},${lead.lon},18z/data=!3m1!1e1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        startIcon={<span>🛰️</span>}
                    >
                        Open Satellite View
                    </Button>

                    <TextField
                        label="Street View / Google Maps URL"
                        placeholder="Paste the Google Maps link here..."
                        fullWidth
                        required
                        value={googleMapsUrl}
                        onChange={(e) => setGoogleMapsUrl(e.target.value)}
                        error={!!error && !googleMapsUrl}
                        helperText="Required to confirm tower existence"
                    />

                    {error && (
                        <Alert severity="error">{error}</Alert>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                <Button
                    onClick={handlePromote}
                    variant="contained"
                    disabled={isSubmitting || !googleMapsUrl}
                >
                    {isSubmitting ? <CircularProgress size={24} /> : 'Save & Promote'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
