import ThemeRegistry from './ThemeRegistry';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Tower Finder CRM",
  description: "Advanced Tower Detection and CRM Dashboard",
};

import Box from '@mui/material/Box';
import NavRail from '@/components/NavRail';
import ContentArea from '@/components/ContentArea';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <NavRail />
            <ContentArea>
              {children}
            </ContentArea>
          </Box>
        </ThemeRegistry>
      </body>
    </html>
  );
}
