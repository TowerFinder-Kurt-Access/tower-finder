'use client';
import { Suspense, type ReactNode } from 'react';
import { SnackbarProvider } from '@/components/GlobalSnackbar';

export function LayoutWithSnackbar({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={null}>
            <SnackbarProvider>
                {children}
            </SnackbarProvider>
        </Suspense>
    );
}
