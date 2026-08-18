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
import Link from '@mui/material/Link';
import { PasswordField } from '@/components/PasswordField';
import { useSnackbar } from '@/components/GlobalSnackbar';

/** "15m 30s" or just "30s" below one minute. */
function formatLockTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function LoginPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showSnackbar } = useSnackbar();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(searchParams.get('error') === 'session-revoked'
        ? 'Your session has ended. Please sign in again.'
        : '');
    const [success, setSuccess] = useState(
        searchParams.get('success') === 'password-reset'
            ? 'Password reset successfully! Please sign in with your new password.'
            : ''
    );
    const [loading, setLoading] = useState(false);
    const [lockSecondsLeft, setLockSecondsLeft] = useState<number | null>(null);

    // OTP second-factor step.
    const [otpStep, setOtpStep] = useState(false);
    const [otp, setOtp] = useState('');
    const [resendSecondsLeft, setResendSecondsLeft] = useState(0);

    // Forgot-password step: email only → sends code.
    const [forgotStep, setForgotStep] = useState(false);

    // Reset-code step: code + new password + confirm.
    const [resetCodeStep, setResetCodeStep] = useState(false);
    const [resetCode, setResetCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    const ticking = lockSecondsLeft !== null && lockSecondsLeft > 0;
    useEffect(() => {
        if (!ticking) return;
        const id = setInterval(
            () => setLockSecondsLeft((s) => (s === null || s <= 0 ? 0 : s - 1)),
            1000
        );
        return () => clearInterval(id);
    }, [ticking]);

    useEffect(() => {
        if (resendSecondsLeft <= 0) return;
        const id = setInterval(() => setResendSecondsLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
        return () => clearInterval(id);
    }, [resendSecondsLeft]);

    // ---- Login handler ----
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLockSecondsLeft(null);
        setLoading(true);

        try {
            const result = await signIn('credentials', { email, password, redirect: false });

            if (result?.code === 'account_locked') {
                setError('Account temporarily locked after too many failed attempts.');
                try {
                    const res = await fetch(`/api/auth/lockout-status?email=${encodeURIComponent(email)}`);
                    const data = (await res.json()) as { remainingSeconds?: number };
                    setLockSecondsLeft(Math.max(0, Math.round(data.remainingSeconds ?? 0)));
                } catch {
                    setLockSecondsLeft(null);
                }
            } else if (result?.code === 'otp_required') {
                setOtpStep(true);
                setResendSecondsLeft(60);
            } else if (result?.code === 'otp_cooldown') {
                setOtpStep(true);
                setResendSecondsLeft(60);
                setError('A code was already sent — wait a moment before requesting another.');
            } else if (result?.code === 'otp_send_failed') {
                setError('Could not send the code. Please try again.');
            } else if (result?.error) {
                setError('Invalid email or password');
            } else {
                router.push('/?success=login');
                router.refresh();
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // ---- OTP verify handler ----
    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await signIn('credentials', { email, password, otp, redirect: false });

            if (result?.code === 'otp_invalid') {
                setOtp('');
                setError('Incorrect code. Try again.');
            } else if (result?.code === 'otp_expired') {
                setOtp('');
                setError('That code expired or was already used — request a new one.');
            } else if (result?.code === 'otp_max_attempts') {
                setOtp('');
                setOtpStep(false);
                setError('Too many wrong codes. Please sign in again.');
            } else if (result?.code === 'account_locked') {
                setOtp('');
                setOtpStep(false);
                setError('Account temporarily locked after too many failed attempts.');
            } else if (result?.error) {
                setOtp('');
                setError('Something went wrong. Please sign in again.');
            } else {
                router.push('/?success=login');
                router.refresh();
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // ---- OTP resend ----
    const handleResend = async () => {
        setError('');
        setLoading(true);
        try {
            const result = await signIn('credentials', { email, password, redirect: false });
            if (result?.code === 'otp_required') {
                setOtp('');
                setResendSecondsLeft(60);
            } else if (result?.code === 'otp_cooldown') {
                setResendSecondsLeft(60);
            } else {
                setOtpStep(false);
                setError('Please try signing in again.');
            }
        } catch {
            setError('Could not resend the code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // ---- Forgot password: request code ----
    const handleForgotSubmit = async (e: React.FormEvent) => {
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
                // Code sent — transition to the reset-code step.
                setForgotStep(false);
                setResetCodeStep(true);
                showSnackbar('Reset code sent! Check your email.', 'success');
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // ---- Reset password: verify code + set new password ----
    const handleResetCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmNewPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    code: resetCode,
                    password: newPassword,
                    confirmPassword: confirmNewPassword,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Something went wrong. Please try again.');
            } else {
                // Success — clear all state, go back to login with success message.
                setResetCodeStep(false);
                setResetCode('');
                setNewPassword('');
                setConfirmNewPassword('');
                setPassword('');
                setSuccess('Password reset successfully! Please sign in with your new password.');
            }
        } catch {
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
                    Tower Finder 4900
                </Typography>

                {otpStep ? (
                    /* ---- OTP second-factor step ---- */
                    <form onSubmit={handleOtpSubmit}>
                        <Typography sx={{ mb: 2 }}>
                            Enter the 6-digit code sent to <strong>{email}</strong>.
                        </Typography>

                        <TextField
                            fullWidth
                            label="One-time code"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            sx={{ mb: 2 }}
                            required
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            slotProps={{ htmlInput: { maxLength: 6, style: { letterSpacing: 8, fontSize: 20, textAlign: 'center' } } }}
                        />

                        <Button
                            fullWidth
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={loading || otp.length !== 6}
                        >
                            {loading ? 'Verifying...' : 'Verify & Sign In'}
                        </Button>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                            <Button size="small" onClick={() => { setOtpStep(false); setOtp(''); }} color="inherit">
                                Back to sign in
                            </Button>
                            <Button
                                size="small"
                                onClick={handleResend}
                                disabled={loading || resendSecondsLeft > 0}
                            >
                                {resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : 'Resend code'}
                            </Button>
                        </Box>
                    </form>
                ) : resetCodeStep ? (
                    /* ---- Reset password: code + new password + confirm ---- */
                    <form onSubmit={handleResetCodeSubmit}>
                        <Typography sx={{ mb: 1, color: 'text.secondary' }}>
                            Enter the 6-digit code sent to <strong>{email}</strong>, then choose a new password.
                        </Typography>

                        <TextField
                            fullWidth
                            label="Reset code"
                            value={resetCode}
                            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            sx={{ mb: 2, mt: 2 }}
                            required
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            slotProps={{ htmlInput: { maxLength: 6, style: { letterSpacing: 8, fontSize: 20, textAlign: 'center' } } }}
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
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            sx={{ mb: 3 }}
                            required
                            autoComplete="new-password"
                        />

                        <Button
                            fullWidth
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={loading || resetCode.length !== 6}
                        >
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </Button>

                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                            <Link
                                component="button"
                                variant="body2"
                                onClick={() => { setResetCodeStep(false); setResetCode(''); setNewPassword(''); setConfirmNewPassword(''); setError(''); }}
                                sx={{ cursor: 'pointer' }}
                            >
                                Back to Sign In
                            </Link>
                        </Box>
                    </form>
                ) : forgotStep ? (
                    /* ---- Forgot password step: email only ---- */
                    <form onSubmit={handleForgotSubmit}>
                        <Typography sx={{ mb: 1, color: 'text.secondary' }}>
                            Enter your email and we&apos;ll send you a reset code.
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
                            {loading ? 'Sending...' : 'Send Reset Code'}
                        </Button>

                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                            <Link
                                component="button"
                                variant="body2"
                                onClick={() => setForgotStep(false)}
                                sx={{ cursor: 'pointer' }}
                            >
                                Back to Sign In
                            </Link>
                        </Box>
                    </form>
                ) : (
                    /* ---- Normal login step ---- */
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
                            sx={{ mb: 1 }}
                            required
                            autoComplete="current-password"
                        />

                        <Box sx={{ mb: 3, textAlign: 'right' }}>
                            <Link
                                component="button"
                                variant="body2"
                                onClick={() => { setForgotStep(true); setError(''); }}
                                sx={{ cursor: 'pointer' }}
                            >
                                Forgot password?
                            </Link>
                        </Box>

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
                )}

                <Typography variant="caption" sx={{ display: 'block', mt: 2, textAlign: 'center', color: 'text.secondary' }}>
                    Default admin: admin@tower-finder.com
                </Typography>
            </Paper>

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

            <Snackbar
                open={!!success}
                autoHideDuration={5000}
                onClose={() => setSuccess('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity="success" variant="filled" onClose={() => setSuccess('')}>
                    {success}
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
