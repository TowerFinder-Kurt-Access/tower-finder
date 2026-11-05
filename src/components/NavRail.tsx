'use client';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ContactsIcon from '@mui/icons-material/Contacts';
import DescriptionIcon from '@mui/icons-material/Description';
import PersonIcon from '@mui/icons-material/Person';
import CellTowerIcon from '@mui/icons-material/CellTower';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { IconButton, MenuItem, Select, FormControl, InputLabel, ListItemIcon, ListItemText, List, ListItemButton, Tooltip } from '@mui/material';
import { useCountry } from '@/lib/country-context';
import { LEASE_URGENT_DAYS } from '@/lib/lease-expiry';
import type { ReactNode } from 'react';

const BP = '/';

const COUNTRIES = [
    { code: 'Canada', flag: '\ud83c\udde8\ud83c\udde6', short: 'CA' },
    { code: 'USA', flag: '\ud83c\uddfa\ud83c\uddf8', short: 'US' },
];

export default function NavRail() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { country, setCountry } = useCountry();
    const [isCollapsed, setIsCollapsed] = useState(false);
    // Count of urgent lease expiries; shown as a notification badge on Towers.
    // null means the count is unavailable, so the badge can say so honestly.
    const [leaseAlertCount, setLeaseAlertCount] = useState<number | null>(null);

    // Auto-collapse on small screens; the toggle still works above the breakpoint.
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 600px)');
        const sync = (e: MediaQueryList | MediaQueryListEvent) => {
            if (e.matches) setIsCollapsed(true);
        };
        sync(mq);
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadLeaseAlerts = () => {
            fetch('/api/lease-alerts')
                .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
                .then((data) => {
                    if (!cancelled) setLeaseAlertCount(typeof data?.count === 'number' ? data.count : null);
                })
                .catch(() => { /* keep the last known count; never fake a zero */ });
        };
        loadLeaseAlerts();
        // Refresh every few minutes so a long-open tab does not show a stale count.
        const interval = setInterval(loadLeaseAlerts, 5 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    const isAdmin = session?.user?.role === 'ADMIN';
    // The lease badge is informational only. Both lists open unfiltered, so a
    // badge click cannot leave the user staring at a filtered or empty table.
    const navItems: { label: string; icon: ReactNode; path: string; href?: string; leaseAlerts: boolean }[] = [
        { label: 'Map', icon: <MapIcon />, path: '/', leaseAlerts: false },
        { label: 'Towers', icon: <TableRowsIcon />, path: '/towers', leaseAlerts: true },
        { label: 'Leads', icon: <ContactsIcon />, path: '/leads', leaseAlerts: false },
        { label: 'Property Owners', icon: <GroupIcon />, path: '/owners', leaseAlerts: true },
        ...(isAdmin ? [{ label: 'Review', icon: <DescriptionIcon />, path: '/review', leaseAlerts: false }] : []),
    ];

    const drawerWidth = isCollapsed ? 80 : 260;

    return (
        <Box className="no-print" sx={{
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                        <CellTowerIcon sx={{ color: 'white', fontSize: 26 }} />
                        <Typography variant="h6" fontWeight="bold" noWrap>
                            Tower Finder
                        </Typography>
                    </Box>
                )}
                <IconButton onClick={() => setIsCollapsed(!isCollapsed)} sx={{ color: 'white' }}>
                    {isCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
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
                    const isActive = pathname === item.path
                        || (item.path !== '/' && pathname.startsWith(BP + item.path + '/'));
                    return (
                        <Tooltip key={item.path} title={isCollapsed ? item.label : ''}>
                            <ListItemButton
                                component="a"
                                href={item.href ?? item.path}
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
                                {item.leaseAlerts && leaseAlertCount !== null && leaseAlertCount > 0 ? (
                                    <Tooltip title={`${leaseAlertCount} lease${leaseAlertCount === 1 ? '' : 's'} expired or expiring within ${LEASE_URGENT_DAYS} days`}>
                                        <Badge badgeContent={leaseAlertCount} color="error" max={99}>
                                            {item.icon}
                                        </Badge>
                                    </Tooltip>
                                ) : item.leaseAlerts && leaseAlertCount === null ? (
                                    <Tooltip title="Lease expiry alert count unavailable">
                                        <Badge variant="dot" color="warning">
                                            {item.icon}
                                        </Badge>
                                    </Tooltip>
                                ) : item.icon}
                            </ListItemIcon>
                            {!isCollapsed && <ListItemText primary={item.label} />}
                            </ListItemButton>
                        </Tooltip>
                    );
                })}
            </List>


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
                        onClick={() => signOut({ callbackUrl: '/login?success=logout' })}
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
