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

/** "15m 30s" or just "30s" below one minute. */
function formatLockTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

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
    // Real seconds left in the account lockout (null = not a lockout error).
    // Ticks down every second so the message shows live remaining time.
    const [lockSecondsLeft, setLockSecondsLeft] = useState<number | null>(null);

    const ticking = lockSecondsLeft !== null && lockSecondsLeft > 0;
    useEffect(() => {
        if (!ticking) return;
        const id = setInterval(
            () => setLockSecondsLeft((s) => (s === null || s <= 0 ? 0 : s - 1)),
            1000
        );
        return () => clearInterval(id);
    }, [ticking]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLockSecondsLeft(null);
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
                setError('Account temporarily locked after too many failed attempts.');
                // Show the real remaining lockout time, not a canned "15 minutes".
                try {
                    const res = await fetch(
                        `/api/auth/lockout-status?email=${encodeURIComponent(email)}`
                    );
                    const data = (await res.json()) as { remainingSeconds?: number };
                    setLockSecondsLeft(Math.max(0, Math.round(data.remainingSeconds ?? 0)));
                } catch {
                    setLockSecondsLeft(null); // fall back to the static message
                }
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

    const lockMessage = lockSecondsLeft !== null
        ? lockSecondsLeft > 0
            ? `Account temporarily locked after too many failed attempts. Try again in ${formatLockTime(lockSecondsLeft)}.`
            : 'Account unlocked. You can try signing in now.'
        : error;

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

            {/* Errors toast here; lockouts stay until dismissed so the
                countdown stays visible. */}
            <Snackbar
                open={!!error}
                autoHideDuration={lockSecondsLeft !== null ? null : 6000}
                onClose={() => setError('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="error" variant="filled" onClose={() => setError('')}>
                    {lockMessage}
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