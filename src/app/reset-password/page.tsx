'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Link from '@mui/material/Link';
import { PasswordField } from '@/components/PasswordField';
import { validatePassword } from '@/lib/password-policy';

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (!token) {
        return (
            <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    Invalid or missing reset link. Please request a new one.
                </Alert>
                <Button fullWidth variant="outlined" onClick={() => router.push('/forgot-password')}>
                    Request New Link
                </Button>
            </Paper>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        const policyError = validatePassword(password);
        if (policyError) {
            setError(policyError);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password, confirmPassword }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Something went wrong. Please try again.');
            } else {
                setSuccess(true);
                // Redirect to login after a short delay so the user sees the success message.
                setTimeout(() => {
                    router.push('/login?success=password-reset');
                }, 2000);
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
            <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 600 }}>
                Tower Finder 4900
            </Typography>

            {success ? (
                <Alert severity="success">
                    Password reset successfully! Redirecting to sign in...
                </Alert>
            ) : (
                <form onSubmit={handleSubmit}>
                    <Typography sx={{ mb: 2, textAlign: 'center', color: 'text.secondary' }}>
                        Enter your new password below.
                    </Typography>

                    <PasswordField
                        fullWidth
                        label="New Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={{ mb: 2 }}
                        required
                        autoFocus
                        autoComplete="new-password"
                    />

                    <PasswordField
                        fullWidth
                        label="Confirm New Password"
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
                        disabled={loading || success}
                    >
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </Button>

                    <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Link
                            component="button"
                            variant="body2"
                            onClick={() => router.push('/login')}
                            sx={{ cursor: 'pointer' }}
                        >
                            Back to Sign In
                        </Link>
                    </Box>
                </form>
            )}

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
        </Paper>
    );
}

export default function ResetPasswordPage() {
    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            bgcolor: '#f5f5f5',
        }}>
            <Suspense fallback={null}>
                <ResetPasswordContent />
            </Suspense>
        </Box>
    );
}
