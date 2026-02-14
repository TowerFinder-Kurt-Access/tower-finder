'use client';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import TableRowsIcon from '@mui/icons-material/TableRows';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ExploreIcon from '@mui/icons-material/Explore';
import LogoutIcon from '@mui/icons-material/Logout';
import { Role } from '@prisma/client';

export default function NavRail() {
    const pathname = usePathname();
    const { data: session } = useSession();

    const baseNavItems = [
        { label: 'Map', icon: <MapIcon />, path: '/' },
        { label: 'Tower Leads', icon: <ExploreIcon />, path: '/tower-leads' },
        { label: 'Towers', icon: <TableRowsIcon />, path: '/towers' },
        { label: 'Owners', icon: <GroupIcon />, path: '/owners' },
    ];

    const adminNavItems = [
        { label: 'Users', icon: <AdminPanelSettingsIcon />, path: '/admin/users' },
    ];

    // Build main nav items based on role
    let navItems = [...baseNavItems];
    if (session?.user?.role === Role.ADMIN) {
        navItems = [...navItems, ...adminNavItems];
    }

    const renderNavItem = (item: { label: string; icon: React.ReactNode; path: string }) => {
        const isActive = pathname === item.path;
        return (
            <a
                key={item.label}
                href={item.path}
                style={{ textDecoration: 'none', color: 'inherit', width: '100%', display: 'block' }}
            >
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 2,
                    gap: 1,
                    cursor: 'pointer',
                    bgcolor: isActive ? '#333' : 'transparent',
                    borderLeft: isActive ? '4px solid #2196f3' : '4px solid transparent',
                    '&:hover': { bgcolor: '#444' },
                    transition: '0.2s'
                }}>
                    <Box sx={{ color: isActive ? '#2196f3' : 'white', display: 'flex' }}>
                        {item.icon}
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: isActive ? 'bold' : 'normal' }}>
                        {item.label}
                    </Typography>
                </Box>
            </a>
        );
    };

    return (
        <Box sx={{
            width: 80,
            flexShrink: 0,
            bgcolor: '#1a1a1a',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 4,
            borderRight: '1px solid #333',
            zIndex: 1300,
            position: 'relative',
            height: '100vh',
            overflowY: 'auto'
        }}>
            {/* Main Navigation Items */}
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
                {navItems.map(renderNavItem)}
            </Box>

            {/* Bottom Actions (Profile & Logout) */}
            <Box sx={{ mt: 'auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {renderNavItem({ label: 'Profile', icon: <PersonIcon />, path: '/profile' })}

                <Box
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 2,
                        gap: 1,
                        cursor: 'pointer',
                        borderLeft: '4px solid transparent',
                        '&:hover': { bgcolor: '#444' },
                        transition: '0.2s',
                        width: '100%',
                        color: '#ff5252' // Red color for logout
                    }}
                >
                    <LogoutIcon />
                    <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                        Logout
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
