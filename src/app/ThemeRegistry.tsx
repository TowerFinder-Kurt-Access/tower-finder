'use client';
import * as React from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppearanceProvider } from '@/components/AppearanceProvider';
import theme from './theme';

// Currency only — the theme itself is light-only.
export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
    return (
        <AppRouterCacheProvider>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <AppearanceProvider>{children}</AppearanceProvider>
            </ThemeProvider>
        </AppRouterCacheProvider>
    );
}
