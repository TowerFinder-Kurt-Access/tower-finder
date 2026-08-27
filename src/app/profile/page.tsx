'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import axios, { AxiosError } from 'axios';
import Link from 'next/link';
import { Role } from '@prisma/client';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import Divider from '@mui/material/Divider';
import Fab from '@mui/material/Fab';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { validatePassword } from '@/lib/password-policy';
import { PasswordField } from '@/components/PasswordField';

export default function ProfilePage() {
    const { data: session, update } = useSession();
    const [profile, setProfile] = useState({ name: '', email: '' });
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');
    const [loading, setLoading] = useState(false);
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [pendingEnableCode, setPendingEnableCode] = useState(false);
    const [enableCode, setEnableCode] = useState('');
    const [twoFactorBusy, setTwoFactorBusy] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success'
    });

    useEffect(() => {
        if (session?.user) {
            setProfile({
                name: session.user.name || '',
                email: session.user.email || ''
            });
            axios
                .get('/api/profile/two-factor')
                .then((res) => setTwoFactorEnabled(res.data?.twoFactorEnabled === true))
                .catch(() => { /* keep the switch off on failure */ });
        }
    }, [session]);

    const handleUpdateProfile = async () => {
        setLoading(true);
        setMessage('');
        try {
            await axios.patch(`/api/users/${session?.user.id}`, profile);
            setMessageType('success');
            setMessage('Profile updated successfully');
            // Update session with new data
            await update({ name: profile.name, email: profile.email });
        } catch (error: unknown) {
            setMessageType('error');
            const message = error instanceof AxiosError
                ? error.response?.data?.error || 'Failed to update profile'
                : 'Failed to update profile';
            setMessage(message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMessageType('error');
            setMessage('Passwords do not match');
            return;
        }

        const policyError = validatePassword(passwordData.newPassword);
        if (policyError) {
            setMessageType('error');
            setMessage(policyError);
            return;
        }

        setLoading(true);
        setMessage('');
        try {
            await axios.post(`/api/users/${session?.user.id}/password`, {
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });
            setMessageType('success');
            setMessage('Password changed successfully. Please login again.');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            // Logout after password change
            setTimeout(() => {
                signOut({ callbackUrl: '/login' });
            }, 2000);
        } catch (error: unknown) {
            setMessageType('error');
            const message = error instanceof AxiosError
                ? error.response?.data?.error || 'Failed to change password'
                : 'Failed to change password';
            setMessage(message);
        } finally {
            setLoading(false);
        }
    };

    const handleEnableTwoFactor = async () => {
        setTwoFactorBusy(true);
        setMessage('');
        try {
            await axios.post('/api/profile/two-factor', { action: 'enable' });
            setPendingEnableCode(true);
            setEnableCode('');
            setSnackbar({
                open: true,
                message: `We've sent a 6-digit code to ${session?.user?.email ?? 'your email'} — check your inbox.`,
                severity: 'success'
            });
        } catch (error: unknown) {
            // Server errors (cooldown, send failure, network) land here.
            const errMessage = error instanceof AxiosError
                ? error.response?.data?.error || 'Could not send the code. Please try again.'
                : 'Could not send the code. Please try again.';
            setSnackbar({ open: true, message: errMessage, severity: 'error' });
        } finally {
            setTwoFactorBusy(false);
        }
    };

    const handleVerifyEnableTwoFactor = async () => {
        setTwoFactorBusy(true);
        setMessage('');
        try {
            const res = await axios.post('/api/profile/two-factor', { action: 'verify', code: enableCode });
            setTwoFactorEnabled(res.data?.twoFactorEnabled === true);
            setPendingEnableCode(false);
            setEnableCode('');
            setSnackbar({ open: true, message: 'Two-factor authentication enabled.', severity: 'success' });
        } catch (error: unknown) {
            // Wrong / expired / exhausted codes come back from the server here.
            const errMessage = error instanceof AxiosError
                ? error.response?.data?.error || 'Could not verify the code. Try again.'
                : 'Could not verify the code. Try again.';
            setSnackbar({ open: true, message: errMessage, severity: 'error' });
        } finally {
            setTwoFactorBusy(false);
        }
    };

    const handleDisableTwoFactor = async () => {
        setTwoFactorBusy(true);
        setMessage('');
        try {
            const res = await axios.post('/api/profile/two-factor', { action: 'disable' });
            setTwoFactorEnabled(res.data?.twoFactorEnabled === true);
            setPendingEnableCode(false);
            setSnackbar({ open: true, message: 'Two-factor authentication disabled.', severity: 'success' });
        } catch (error: unknown) {
            const errMessage = error instanceof AxiosError
                ? error.response?.data?.error || 'Could not disable two-factor authentication.'
                : 'Could not disable two-factor authentication.';
            setSnackbar({ open: true, message: errMessage, severity: 'error' });
        } finally {
            setTwoFactorBusy(false);
        }
    };

    return (
        <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
            <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>Profile Settings</Typography>

            {session?.user?.mustChangePassword && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    Your password is over 180 days old. Please change it below to continue.
                </Alert>
            )}

            {message && (
                <Alert severity={messageType} sx={{ mb: 3 }}>
                    {message}
                </Alert>
            )}

            {/* User Info Display */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Account Information</Typography>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">Name</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>{session?.user?.name}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">Email</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>{session?.user?.email}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">Role</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
                        {session?.user?.role}
                    </Typography>
                </Box>
            </Paper>

            {/* Profile Update Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Update Profile</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Name"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        label="Email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        fullWidth
                    />
                    <Button
                        variant="contained"
                        onClick={handleUpdateProfile}
                        disabled={loading}
                    >
                        {loading ? 'Updating...' : 'Update Profile'}
                    </Button>
                </Box>
            </Paper>

            {/* Two-Factor Authentication Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>Two-Factor Authentication</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Optional: require a 6-digit code emailed to you each time you sign in.
                    You'll verify email delivery once when turning it on.
                </Typography>
                <FormControlLabel
                    control={
                        <Switch
                            checked={twoFactorEnabled || pendingEnableCode}
                            disabled={twoFactorBusy}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    handleEnableTwoFactor();
                                } else {
                                    handleDisableTwoFactor();
                                }
                            }}
                        />
                    }
                    label={twoFactorEnabled || pendingEnableCode ? 'On' : 'Off'}
                />
                {pendingEnableCode && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="One-time code"
                            value={enableCode}
                            onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            fullWidth
                            autoFocus
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="contained"
                                onClick={handleVerifyEnableTwoFactor}
                                disabled={enableCode.length !== 6 || twoFactorBusy}
                            >
                                {twoFactorBusy ? 'Verifying...' : 'Verify & Enable'}
                            </Button>
                            <Button
                                variant="text"
                                disabled={twoFactorBusy}
                                onClick={() => {
                                    setPendingEnableCode(false);
                                    setEnableCode('');
                                }}
                            >
                                Cancel
                            </Button>
                        </Box>
                    </Box>
                )}
            </Paper>

            {/* Password Change Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <PasswordField
                        label="Current Password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        fullWidth
                    />
                    <PasswordField
                        label="New Password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        fullWidth
                        error={!!passwordData.newPassword && !!validatePassword(passwordData.newPassword)}
                        helperText={
                            passwordData.newPassword && validatePassword(passwordData.newPassword)
                                ? validatePassword(passwordData.newPassword)
                                : 'At least 10 characters, with upper, lower, number, and special characters'
                        }
                    />
                    <PasswordField
                        label="Confirm New Password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        fullWidth
                        error={!!passwordData.confirmPassword && passwordData.confirmPassword !== passwordData.newPassword}
                        helperText={
                            passwordData.confirmPassword && passwordData.confirmPassword !== passwordData.newPassword
                                ? 'Passwords do not match'
                                : undefined
                        }
                    />
                    <Button
                        variant="contained"
                        onClick={handleChangePassword}
                        disabled={loading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                    >
                        {loading ? 'Changing...' : 'Change Password'}
                    </Button>
                </Box>
            </Paper>

            {/* Logout Section */}
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Session</Typography>
                <Button
                    variant="outlined"
                    color="error"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                >
                    Sign Out
                </Button>
            </Paper>

            {/* Two-factor feedback toast: code sent to [email], enable/disable
                results, and any server error (cooldown / send failed / wrong
                code) surfaces here. */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    severity={snackbar.severity}
                    variant="filled"
                    onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Admin-only FAB: open Superpowers */}
            {session?.user?.role === Role.ADMIN && (
                <Fab
                    component={Link}
                    href="/superpowers"
                    variant="extended"
                    color="primary"
                    aria-label="Admin Tools"
                    sx={{
                        position: 'fixed',
                        bottom: 24,
                        right: 24,
                        textTransform: 'none',
                        fontWeight: 600,
                    }}
                >
                    <AdminPanelSettingsIcon sx={{ mr: 1 }} />
                    Admin Tools
                </Fab>
            )}
         </Box>
    );
}
