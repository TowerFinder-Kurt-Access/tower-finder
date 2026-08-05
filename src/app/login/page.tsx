'use client';
import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { PasswordField } from '@/components/PasswordField';

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
    const [loading, setLoading] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const TOAST_AUTO_HIDE_SECONDS = 6;

    // Starts the tick-down whenever a new error appears.
    useEffect(() => {
        if (!error) return;
        setSecondsLeft(TOAST_AUTO_HIDE_SECONDS);
        const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
        return () => clearInterval(id);
    }, [error]);

    // Auto-dismisses the toast when the countdown hits zero.
    useEffect(() => {
        if (error && secondsLeft === 0) setError('');
    }, [error, secondsLeft]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
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
            } else if (result?.error) {
                setError('Invalid email or password');
            } else {
                router.push('/');
                router.refresh();
            }
        } catch (err) {
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
                <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 600 }}>
                    Tower Finder 4900
                </Typography>

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

                    <PasswordField
                        fullWidth
                        label="Password"
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

            {/* Errors toast here; the card stays clean. */}
            <Snackbar
                open={!!error}
                onClose={() => setError('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="error" variant="filled" onClose={() => setError('')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ flex: 1 }}>{error}</Box>
                        <Typography
                            variant="caption"
                            component="span"
                            sx={{ opacity: 0.9, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                        >
                            {secondsLeft}s
                        </Typography>
                    </Box>
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
