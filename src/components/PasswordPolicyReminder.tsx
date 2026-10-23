'use client';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

/** Blocking nudge for accounts whose password predates the current policy.
 *  It hides only on the pages where the password can be changed. The user can
 *  still sign out, which is the way to reach the email reset if the current
 *  password is forgotten. */
export function PasswordPolicyReminder() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const outdated = Boolean(session?.user?.passwordPolicyOutdated);

    // Never cover the page that fixes the problem.
    if (!outdated) return null;
    if (pathname === '/profile' || pathname === '/change-password') return null;

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={() => {}} className="no-print">
            <DialogTitle>Update your password</DialogTitle>
            <DialogContent>
                <DialogContentText component="div" sx={{ display: 'grid', gap: 1.5 }}>
                    <span>
                        Your password was set before the current password policy, so it may be
                        weaker than we now require.
                    </span>
                    <span>
                        You must update it before continuing. The new password needs at least 10
                        characters, with upper and lower case, a number, and a special character.
                    </span>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={() => signOut({ callbackUrl: '/login?success=logout' })}>
                    Sign out
                </Button>
                <Button variant="contained" onClick={() => router.push('/profile')}>
                    Go to profile
                </Button>
            </DialogActions>
        </Dialog>
    );
}
