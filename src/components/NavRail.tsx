'use client';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import * as React from 'react';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import TableRowsIcon from '@mui/icons-material/TableRows';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ExploreIcon from '@mui/icons-material/Explore';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import SettingsIcon from '@mui/icons-material/Settings';
import { IconButton, MenuItem, Select, FormControl, InputLabel, ListItemIcon, ListItemText, List, ListItemButton } from '@mui/material';
import { Role } from '@prisma/client';
import { useCountry } from '@/lib/country-context';

const COUNTRIES = [
    { code: 'Canada', flag: '\ud83c\udde8\ud83c\udde6', short: 'CA' },
    { code: 'USA', flag: '\ud83c\uddfa\ud83c\uddf8', short: 'US' },
];

export default function NavRail() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { country, setCountry } = useCountry();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const baseNavItems = [
        { label: 'Map', icon: <MapIcon />, path: '/' },
        { label: 'Tower Leads', icon: <ExploreIcon />, path: '/tower-leads' },
        { label: 'Towers', icon: <TableRowsIcon />, path: '/towers' },
        { label: 'Property Owners', icon: <GroupIcon />, path: '/owners' },
    ];

    const adminNavItems = [
        { label: 'Users', icon: <AdminPanelSettingsIcon />, path: '/admin/users' },
        { label: 'Lookups', icon: <SettingsIcon />, path: '/admin/lookups' },
    ];

    let navItems = [...baseNavItems];
    if (session?.user?.role === Role.ADMIN) {
        navItems = [...navItems, ...adminNavItems];
    }

    const drawerWidth = isCollapsed ? 80 : 260;

    return (
        <Box sx={{
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
        }}>
            {/* Header / Toggle */}
            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                borderBottom: '1px solid #333'
            }}>
                {!isCollapsed && (
                    <Typography variant="h6" fontWeight="bold" noWrap>
                        Tower Finder
                    </Typography>
                )}
                <IconButton onClick={() => setIsCollapsed(!isCollapsed)} sx={{ color: 'white' }}>
                    {isCollapsed ? <MenuIcon /> : <ChevronLeftIcon />}
                </IconButton>
            </Box>

            {/* Country Selector */}
            <Box sx={{ p: 2 }}>
                {isCollapsed ? (
                    <Box
                        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                        onClick={() => setIsCollapsed(false)} // Expand to change country
                    >
                        <Typography sx={{ fontSize: '1.5rem' }}>
                            {COUNTRIES.find(c => c.code === country)?.flag || '🌍'}
                        </Typography>
                    </Box>
                ) : (
                    <FormControl fullWidth size="small" variant="outlined">
                        <InputLabel sx={{ color: '#aaa' }}>Region</InputLabel>
                        <Select
                            value={country}
                            label="Region"
                            onChange={(e) => setCountry(e.target.value)}
                            sx={{
                                color: 'white',
                                '.MuiOutlinedInput-notchedOutline': { borderColor: '#444' },
                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#666' },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2196f3' },
                                '.MuiSvgIcon-root': { color: 'white' }
                            }}
                        >
                            {COUNTRIES.map((c) => (
                                <MenuItem key={c.code} value={c.code}>
                                    {c.flag} {c.code}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Box>

            {/* Nav Items */}
            <List sx={{ px: 1 }}>
                {navItems.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                        <ListItemButton
                            key={item.path}
                            component="a"
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
                            <ListItemIcon sx={{
                                color: isActive ? '#64b5f6' : 'white',
                                minWidth: 0,
                                mr: isCollapsed ? 0 : 2,
                                justifyContent: 'center'
                            }}>
                                {item.icon}
                            </ListItemIcon>
                            {!isCollapsed && <ListItemText primary={item.label} />}
                        </ListItemButton>
                    );
                })}
            </List>

            {/* Bottom Section */}
            <Box sx={{ mt: 'auto', borderTop: '1px solid #333', p: 1 }}>
                <List>
                    <ListItemButton
                        component="a"
                        href="/profile"
                        sx={{
                            justifyContent: isCollapsed ? 'center' : 'initial',
                            borderRadius: 1,
                            color: 'white',
                            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
                        }}
                    >
                        <ListItemIcon sx={{
                            color: 'white',
                            minWidth: 0,
                            mr: isCollapsed ? 0 : 2,
                            justifyContent: 'center'
                        }}>
                            <PersonIcon />
                        </ListItemIcon>
                        {!isCollapsed && <ListItemText primary="Profile" />}
                    </ListItemButton>

                    <ListItemButton
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        sx={{
                            justifyContent: isCollapsed ? 'center' : 'initial',
                            borderRadius: 1,
                            color: '#ff5252',
                            '&:hover': { bgcolor: 'rgba(255, 82, 82, 0.08)' }
                        }}
                    >
                        <ListItemIcon sx={{
                            color: '#ff5252',
                            minWidth: 0,
                            mr: isCollapsed ? 0 : 2,
                            justifyContent: 'center'
                        }}>
                            <LogoutIcon />
                        </ListItemIcon>
                        {!isCollapsed && <ListItemText primary="Logout" />}
                    </ListItemButton>
                </List>
            </Box>
        </Box>
    );
}
