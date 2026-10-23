'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

const SNOOZE_KEY = 'two-factor-reminder-snoozed-at';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Nudge for accounts without a second factor. Unlike the password policy
 *  reminder this one can be deferred, for a day at a time. Suppressed while a
 *  password update is outstanding, so only one dialog is ever on screen. */
export function TwoFactorReminder() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [snoozed, setSnoozed] = useState(() => {
        if (typeof window === 'undefined') return false;
        const at = Number(localStorage.getItem(SNOOZE_KEY) || 0);
        return Date.now() - at < SNOOZE_MS;
    });

    if (session?.user?.twoFactorEnabled !== false) return null;
    if (session?.user?.passwordPolicyOutdated) return null;
    if (pathname === '/profile' || pathname === '/change-password') return null;
    if (snoozed) return null;

    const snooze = () => {
        localStorage.setItem(SNOOZE_KEY, String(Date.now()));
        setSnoozed(true);
    };

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={snooze} className="no-print">
            <DialogTitle>Turn on two-factor authentication</DialogTitle>
            <DialogContent>
                <DialogContentText component="div" sx={{ display: 'grid', gap: 1.5 }}>
                    <span>
                        Your account signs in with a password only. Turning on two-factor
                        authentication adds a one-time code by email at each sign-in.
                    </span>
                    <span>
                        Turn it on from your profile. You can do this later, and this reminder
                        will come back tomorrow.
                    </span>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={snooze}>
                    Later
                </Button>
                <Button variant="contained" onClick={() => router.push('/profile')}>
                    Enable 2FA
                </Button>
            </DialogActions>
        </Dialog>
    );
}
