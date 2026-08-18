'use client';
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

interface SnackbarContextValue {
    showSnackbar: (message: string, severity?: 'success' | 'info' | 'warning' | 'error') => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({ showSnackbar: () => {} });

export function useSnackbar() {
    return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
    const searchParams = useSearchParams();
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<'success' | 'info' | 'warning' | 'error'>('success');

    const showSnackbar = useCallback((
        msg: string,
        sev: 'success' | 'info' | 'warning' | 'error' = 'success',
    ) => {
        setMessage(msg);
        setSeverity(sev);
        setOpen(true);
    }, []);

    // Pick up success messages from URL params on mount (login, logout, password-reset).
    useEffect(() => {
        const success = searchParams.get('success');
        if (success === 'login') {
            showSnackbar('Signed in successfully.', 'success');
            // Clean the URL param so the snackbar doesn't re-show on refresh.
            window.history.replaceState({}, '', '/');
        } else if (success === 'logout') {
            showSnackbar('Signed out successfully.', 'info');
            window.history.replaceState({}, '', '/login');
        } else if (success === 'password-reset') {
            showSnackbar('Password reset successfully! Please sign in with your new password.', 'success');
            window.history.replaceState({}, '', '/login');
        }
    }, [searchParams, showSnackbar]);

    return (
        <SnackbarContext.Provider value={{ showSnackbar }}>
            {children}
            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={(_e, reason) => { if (reason !== 'clickaway') setOpen(false); }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    severity={severity}
                    variant="filled"
                    onClose={() => setOpen(false)}
                    sx={{ width: '100%' }}
                >
                    {message}
                </Alert>
            </Snackbar>
        </SnackbarContext.Provider>
    );
}
