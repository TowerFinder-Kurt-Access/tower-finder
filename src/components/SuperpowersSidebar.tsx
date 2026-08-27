'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { IconButton, ListItemIcon, ListItemText, List, ListItemButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import LogoutIcon from '@mui/icons-material/Logout';
import ExploreIcon from '@mui/icons-material/Explore';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import RadarIcon from '@mui/icons-material/Radar';
import SettingsIcon from '@mui/icons-material/Settings';

const NAV_ITEMS = [
    { label: 'Tower Leads', icon: <ExploreIcon />, path: '/superpowers/tower-leads' },
    { label: 'Users', icon: <AdminPanelSettingsIcon />, path: '/superpowers/users' },
    { label: 'Background Jobs', icon: <AutorenewIcon />, path: '/superpowers/jobs' },
    { label: 'Discovery Scans', icon: <RadarIcon />, path: '/superpowers/discovery' },
    { label: 'Lookups', icon: <SettingsIcon />, path: '/superpowers/lookups' },
];

export default function SuperpowersSidebar() {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const drawerWidth = isCollapsed ? 80 : 260;

    return (
        <Box
            component="nav"
            aria-label="Superpowers navigation"
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                bgcolor: '#1a1a1a',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid #333',
                height: '100vh',
                overflowY: 'auto',
                transition: 'width 0.3s ease',
                position: 'relative',
                zIndex: 1300,
            }}
        >
            {/* Header: Back button + Title + Collapse toggle */}
            <Box
                sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    borderBottom: '1px solid #333',
                    gap: 1,
                }}
            >
                {!isCollapsed && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <IconButton
                            component={Link}
                            href="/superpowers"
                            aria-label="Back to Superpowers landing"
                            sx={{ color: 'white', p: 0.5 }}
                        >
                            <ArrowBackIcon />
                        </IconButton>
                        <Typography variant="h6" fontWeight="bold" noWrap>
                            Superpowers
                        </Typography>
                    </Box>
                )}
                <IconButton
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    sx={{ color: 'white' }}
                >
                    {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
                </IconButton>
            </Box>

            {/* Nav items */}
            <List sx={{ px: 1 }}>
                 {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                        <ListItemButton
                            key={item.path}
                            component={Link}
                            href={item.path}
                            selected={isActive}
                            sx={{
                                justifyContent: isCollapsed ? 'center' : 'initial',
                                borderRadius: 1,
                                mb: 0.5,
                                bgcolor: isActive ? 'rgba(33, 150, 243, 0.16)' : 'transparent',
                                color: isActive ? '#64b5f6' : 'white',
                                '&.Mui-selected': { bgcolor: 'rgba(33, 150, 243, 0.25)' },
                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    color: isActive ? '#64b5f6' : 'white',
                                    minWidth: 0,
                                    mr: isCollapsed ? 0 : 2,
                                    justifyContent: 'center',
                                }}
                            >
                                {item.icon}
                            </ListItemIcon>
                            {!isCollapsed && <ListItemText primary={item.label} />}
                        </ListItemButton>
                    );
                })}
            </List>

            {/* Footer: Logout */}
            <Box sx={{ mt: 'auto', borderTop: '1px solid #333', p: 1 }}>
                <List>
                    <ListItemButton
                        onClick={() => signOut({ callbackUrl: '/login?success=logout' })}
                        sx={{
                            justifyContent: isCollapsed ? 'center' : 'initial',
                            borderRadius: 1,
                            color: '#ff5252',
                            '&:hover': { bgcolor: 'rgba(255, 82, 82, 0.08)' },
                        }}
                    >
                        <ListItemIcon
                            sx={{
                                color: '#ff5252',
                                minWidth: 0,
                                mr: isCollapsed ? 0 : 2,
                                justifyContent: 'center',
                            }}
                        >
                            <LogoutIcon />
                        </ListItemIcon>
                        {!isCollapsed && <ListItemText primary="Logout" />}
                    </ListItemButton>
                </List>
            </Box>
        </Box>
    );
}
