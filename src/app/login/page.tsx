'use client';
import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

function LoginPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // Middleware bounces revoked (deactivated / password-reset) sessions here
    // via ?error=session-revoked.
    const [error, setError] = useState(searchParams.get('error') === 'session-revoked'
        ? 'Your session has ended. Please sign in again.'
        : '');
    // Snackbar visibility is separate from `error` so dismissing the toast
    // (auto or manual) keeps the inline card alert until the next submit.
    const [toastOpen, setToastOpen] = useState(searchParams.get('error') === 'session-revoked');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setToastOpen(false);
        setLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false
            });

            // NextAuth surfaces custom CredentialsSignin codes via result.code
            // (URL ?error=CredentialsSignin&code=account_locked).
            if (result?.code === 'account_locked') {
                setError('Account temporarily locked after too many failed attempts. Try again in about 15 minutes.');
                setToastOpen(true);
            } else if (result?.error) {
                setError('Invalid email or password');
                setToastOpen(true);
            } else {
                router.push('/');
                router.refresh();
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
            setToastOpen(true);
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
                <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 600 }}>
                    Tower Finder 4900 kurt
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <TextField
                        fullWidth
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        sx={{ mb: 2 }}
                        required
                        autoComplete="email"
                    />

                    <TextField
                        fullWidth
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={{ mb: 3 }}
                        required
                        autoComplete="current-password"
                    />

                    <Button
                        fullWidth
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={loading}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </Button>
                </form>

                <Typography variant="caption" sx={{ display: 'block', mt: 2, textAlign: 'center', color: 'text.secondary' }}>
                    Default admin: admin@tower-finder.com
                </Typography>
            </Paper>

            {/* Toast the same error the card shows inline. */}
            <Snackbar
                open={toastOpen}
                autoHideDuration={6000}
                onClose={() => setToastOpen(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="error" variant="filled" onClose={() => setToastOpen(false)}>
                    {error}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginPageContent />
        </Suspense>
    );
}
