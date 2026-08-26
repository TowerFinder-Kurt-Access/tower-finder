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

export default function SuperpowersShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const onSuperpowers = pathname?.startsWith('/superpowers') ?? false;

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
            <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
                <SuperpowersSidebar />
                <ContentArea>{children}</ContentArea>
                <PasswordChangeReminder />
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <NavRail />
            <ContentArea>{children}</ContentArea>
            <PasswordChangeReminder />
        </Box>
    );
}
