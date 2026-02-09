'use client';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import axios from 'axios';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';

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

    useEffect(() => {
        if (session?.user) {
            setProfile({
                name: session.user.name || '',
                email: session.user.email || ''
            });
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
        } catch (error: any) {
            setMessageType('error');
            setMessage(error.response?.data?.error || 'Failed to update profile');
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

        if (passwordData.newPassword.length < 8) {
            setMessageType('error');
            setMessage('Password must be at least 8 characters');
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
        } catch (error: any) {
            setMessageType('error');
            setMessage(error.response?.data?.error || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
            <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>Profile Settings</Typography>

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

            {/* Password Change Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Current Password"
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        label="New Password"
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        fullWidth
                        helperText="Must be at least 8 characters"
                    />
                    <TextField
                        label="Confirm New Password"
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        fullWidth
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
        </Box>
    );
}
