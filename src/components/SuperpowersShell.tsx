'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Role } from '@prisma/client';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import NavRail from './NavRail';
import SuperpowersSidebar from './SuperpowersSidebar';
import ContentArea from './ContentArea';
import { PasswordChangeReminder } from './PasswordChangeReminder';
import { PasswordPolicyReminder } from './PasswordPolicyReminder';
import { TwoFactorEnrollment } from './TwoFactorEnrollment';

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];

export default function SuperpowersShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const onSuperpowers = pathname?.startsWith('/superpowers') ?? false;
    const onPublicRoute = PUBLIC_ROUTES.some((r) => pathname === r || pathname?.startsWith(`${r}/`));

    // Public routes and the forced password screen render bare: no
    // NavRail/sidebar chrome around the auth card.
    if (onPublicRoute || pathname === '/change-password') {
        return <>{children}</>;
    }

    // While session loads on a protected route, hold the shell so an
    // expired/revoked session never flashes the dashboard behind login.
    if (status === 'loading' && !onSuperpowers) {
        return (
            <Box sx={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!session?.user && !onSuperpowers) {
        return (
            <Box sx={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    // 2FA is activated first, enforced second. Until the email code proves the
    // address, every protected page is replaced by the setup screen. Password
    // changes go first, so that route stays reachable.
    if (session?.user?.twoFactorEnabled === false && pathname !== '/change-password') {
        return <TwoFactorEnrollment />;
    }

    if (onSuperpowers) {
        if (status === 'loading') {
            return (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress />
                </Box>
            );
        }
        if (session?.user?.role !== Role.ADMIN) {
            return (
                <Box sx={{ flex: 1, p: 4 }}>
                    <Alert severity="error">Access Denied. Admin privileges required.</Alert>
                </Box>
            );
        }
        return (
            <Box className="app-shell" sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
                <SuperpowersSidebar />
                <ContentArea>{children}</ContentArea>
                <PasswordChangeReminder />
                <PasswordPolicyReminder />
            </Box>
        );
    }

    return (
        <Box className="app-shell" sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <NavRail />
            <ContentArea>{children}</ContentArea>
            <PasswordChangeReminder />
            <PasswordPolicyReminder />
        </Box>
    );
}
