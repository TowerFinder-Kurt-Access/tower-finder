import ThemeRegistry from './ThemeRegistry';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import Box from '@mui/material/Box';
import NavRail from '@/components/NavRail';
import ContentArea from '@/components/ContentArea';
import { SessionProvider } from 'next-auth/react';
import { CountryProvider } from '@/lib/country-context';

export const metadata: Metadata = {
  title: "Tower Finder 4900",
  description: "Advanced Tower Detection and CRM Dashboard",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <SessionProvider session={session}>
            <CountryProvider>
              {session ? (
                <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
                  <NavRail />
                  <ContentArea>
                    {children}
                  </ContentArea>
                </Box>
              ) : (
                children
              )}
            </CountryProvider>
          </SessionProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
