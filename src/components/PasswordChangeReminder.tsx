'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

const SNOOZE_KEY = 'password-reminder-snoozed-at';
const SNOOZE_MS = 24 * 60 * 60 * 1000; // remind again after one day

/** Overlay prompt for the 180-day password rotation: users can snooze it
 *  ("Remind me later") instead of being pinned to the profile page. */
export function PasswordChangeReminder() {
    const { data: session } = useSession();
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!session?.user?.mustChangePassword) {
            // Fresh password (or signed out): clear any stale snooze so the
            // next 180-day cycle prompts right away.
            localStorage.removeItem(SNOOZE_KEY);
            setOpen(false);
            return;
        }
        const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) || 0);
        if (Date.now() - snoozedAt < SNOOZE_MS) return; // still snoozed
        setOpen(true);
    }, [session?.user?.mustChangePassword]);

    const remindLater = () => {
        localStorage.setItem(SNOOZE_KEY, String(Date.now()));
        setOpen(false);
    };

    const changeNow = () => {
        setOpen(false);
        router.push('/profile');
    };

    return (
        <Dialog open={open} onClose={remindLater} maxWidth="sm" fullWidth>
            <DialogTitle>Password expires soon</DialogTitle>
            <DialogContent>
                <Typography>
                    Your password is over 180 days old. For security, update it soon — you can
                    change it in your profile.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={remindLater} color="inherit">
                    Remind me later
                </Button>
                <Button onClick={changeNow} variant="contained">
                    Change password
                </Button>
            </DialogActions>
        </Dialog>
    );
}