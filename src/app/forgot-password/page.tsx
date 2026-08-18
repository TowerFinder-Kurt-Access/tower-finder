'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Link from '@mui/material/Link';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Something went wrong. Please try again.');
            } else {
                setSubmitted(true);
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
            bgcolor: '#f5f5f5',
        }}>
            <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
                <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 600 }}>
                    Tower Finder 4900
                </Typography>

                {submitted ? (
                    <>
                        <Alert severity="success" sx={{ mb: 2 }}>
                            If an account with that email exists, a password reset link has been sent. Check your inbox.
                        </Alert>
                        <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary', textAlign: 'center' }}>
                            Didn&apos;t receive the email? Check your spam folder, or try again in a few minutes.
                        </Typography>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => router.push('/login')}
                        >
                            Back to Sign In
                        </Button>
                    </>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <Typography sx={{ mb: 1, textAlign: 'center', color: 'text.secondary' }}>
                            Enter your email address and we&apos;ll send you a link to reset your password.
                        </Typography>

                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            sx={{ mb: 3, mt: 2 }}
                            required
                            autoFocus
                            autoComplete="email"
                        />

                        <Button
                            fullWidth
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={loading}
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
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
        </Box>
    );
}
