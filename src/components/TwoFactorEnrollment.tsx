'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';

interface ApiError {
    error?: string;
}

/**
 * Blocking setup screen for accounts that have not activated 2FA yet.
 * Password login stays password-only; access unlocks after the email code
 * proves the address, then the next sign-in uses the code step.
 */
export function TwoFactorEnrollment() {
    const [sent, setSent] = useState(false);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const call = async (action: 'enable' | 'verify') => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/profile/two-factor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, code }),
            });
            const data = (await response.json()) as ApiError;
            if (!response.ok) {
                setError(data.error ?? 'Could not complete setup.');
                return;
            }
            if (action === 'enable') {
                setSent(true);
                return;
            }
            await signOut({ callbackUrl: '/login?success=2fa-enabled' });
        } catch {
            setError('Could not reach the server.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box
            sx={{
                display: 'flex',
                minHeight: '100vh',
                width: '100vw',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default',
                p: 3,
            }}
        >
            <Paper sx={{ p: 4, width: '100%', maxWidth: 440 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                    Enable two-factor authentication
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Your account requires 2FA before you continue. We email an 8-digit code to your
                    address. Enter it to finish setup. After setup, every sign-in asks for a code.
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {!sent ? (
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        disabled={busy}
                        onClick={() => call('enable')}
                    >
                        {busy ? 'Sending code...' : 'Send code'}
                    </Button>
                ) : (
                    <Box
                        component="form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void call('verify');
                        }}
                        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                        <TextField
                            label="8-digit code"
                            value={code}
                            onChange={(event) => {
                                setCode(event.target.value.replace(/\D/g, '').slice(0, 8));
                                setError('');
                            }}
                            autoFocus
                            fullWidth
                            inputProps={{ inputMode: 'numeric', maxLength: 8 }}
                            helperText="Check your inbox, including spam."
                        />
                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={busy || code.length !== 8}
                        >
                            {busy ? 'Verifying...' : 'Verify and finish'}
                        </Button>
                        <Button
                            variant="text"
                            disabled={busy}
                            onClick={() => call('enable')}
                            sx={{ textTransform: 'none' }}
                        >
                            Send a new code
                        </Button>
                    </Box>
                )}

                <Button
                    fullWidth
                    variant="text"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    sx={{ mt: 2, textTransform: 'none' }}
                >
                    Sign out
                </Button>
            </Paper>
        </Box>
    );
}
