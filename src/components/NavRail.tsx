'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MapIcon from '@mui/icons-material/Map';
import GroupIcon from '@mui/icons-material/Group';
import TableRowsIcon from '@mui/icons-material/TableRows';
// ... (imports)

export default function NavRail() {
    const pathname = usePathname();

    const navItems = [
        { label: 'Map', icon: <MapIcon />, path: '/' },
        { label: 'Towers', icon: <TableRowsIcon />, path: '/towers' },
        { label: 'Owners', icon: <GroupIcon />, path: '/owners' },
    ];

    return (
        <Box sx={{
            width: 80,
            flexShrink: 0, // Prevent shrinking
            bgcolor: '#1a1a1a',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 4,
            borderRight: '1px solid #333',
            zIndex: 1300,
            position: 'relative'
        }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
                {navItems.map((item) => {
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
                })}
            </Box>
        </Box>
    );
}
