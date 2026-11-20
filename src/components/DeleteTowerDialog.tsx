'use client';

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

interface DeleteTowerDialogProps {
    open: boolean;
    towerId: number | null;
    busy: boolean;
    error?: string;
    onClose: () => void;
    onConfirm: () => void;
}

/**
 * Confirms a tower delete. The action is not reversible and there is no restore
 * path, so the dialog names the tower and states what else goes with it.
 */
export default function DeleteTowerDialog({
    open, towerId, busy, error, onClose, onConfirm,
}: DeleteTowerDialogProps) {
    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Delete tower #{towerId ?? ''}?</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary">
                    This removes the tower, its parcel, notes, leads, phones, documents, assignments and nearby
                    businesses. A property owner is deleted only when no other tower uses it.
                </Typography>
                <Alert severity="warning" sx={{ mt: 2 }}>
                    This cannot be undone. There is no restore after a delete.
                </Alert>
                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>Cancel</Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={onConfirm}
                    disabled={busy}
                    startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
                    sx={{ textTransform: 'none' }}
                >
                    {busy ? 'Deleting...' : 'Delete Tower'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
