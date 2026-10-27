'use client';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { PasswordField } from '@/components/PasswordField';

export default function ChangePasswordPage() {
    const { data: session } = useSession();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // A reset bumps sessionVersion. If this page is reached with the old
    // cookie, the token still carries forcedPasswordChange and middleware can
    // fail open during a DB blip. Validate once and clear the stale session.
    useEffect(() => {
        let cancelled = false;
        void fetch('/api/auth/session-version')
            .then((res) => {
                if (!cancelled && res.status === 401) {
                    void signOut({ callbackUrl: '/login?error=session-revoked' });
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/users/${session?.user?.id}/password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();

            if (res.status === 401) {
                void signOut({ callbackUrl: '/login?error=session-revoked' });
                return;
            }

            if (!res.ok) {
                setError(data.error || 'Something went wrong. Please try again.');
            } else {
                // Password changed — session is invalidated, sign out to force re-login.
                signOut({ callbackUrl: '/login?success=password-changed' });
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            bgcolor: '#f5f5f5'
        }}>
            <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
                <Typography variant="h4" sx={{ mb: 1, textAlign: 'center', fontWeight: 600 }}>
                    Tower Finder 4900
                </Typography>
                <Typography variant="body2" sx={{ mb: 3, textAlign: 'center', color: 'text.secondary' }}>
                    You must set a new password before continuing.
                </Typography>

                <form onSubmit={handleSubmit}>
                    <PasswordField
                        fullWidth
                        label="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        sx={{ mb: 2 }}
                        required
                        autoFocus
                        autoComplete="current-password"
                    />

                    <PasswordField
                        fullWidth
                        label="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        sx={{ mb: 2 }}
                        required
                        autoComplete="new-password"
                    />

                    <PasswordField
                        fullWidth
                        label="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        sx={{ mb: 3 }}
                        required
                        autoComplete="new-password"
                    />

                    <Button
                        fullWidth
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={loading}
                    >
                        {loading ? 'Changing...' : 'Change Password'}
                    </Button>

                    <Box sx={{ mt: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button
                            type="button"
                            variant="text"
                            onClick={() => signOut({ callbackUrl: '/login?forgot=1' })}
                            sx={{ textTransform: 'none' }}
                        >
                            Forgot your current password? Reset it by email
                        </Button>
                        <Button
                            type="button"
                            variant="text"
                            onClick={() => signOut({ callbackUrl: '/login' })}
                            sx={{ textTransform: 'none' }}
                        >
                            Sign out and reset session
                        </Button>
                    </Box>
                </form>
            </Paper>

            <Snackbar
                open={!!error}
                autoHideDuration={6000}
                onClose={() => setError('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="error" variant="filled" onClose={() => setError('')}>
                    {error}
                </Alert>
            </Snackbar>
        </Box>
    );
}
