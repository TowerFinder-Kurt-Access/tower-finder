'use client';

import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';

export default function ContentArea({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    return (
        <Box
            key={pathname}
            sx={{
                flex: 1,
                overflow: 'auto',
                position: 'relative',
                bgcolor: 'background.default'
            }}
        >
            {children}
        </Box>
    );
}
