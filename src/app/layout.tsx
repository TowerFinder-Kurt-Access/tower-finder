import ThemeRegistry from './ThemeRegistry';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import SuperpowersShell from '@/components/SuperpowersShell';
import { SessionProvider } from 'next-auth/react';
import { CountryProvider } from '@/lib/country-context';
import { LayoutWithSnackbar } from '@/components/LayoutWithSnackbar';
export const metadata: Metadata = {
  title: "Tower Finder 4900",
  description: "Advanced Tower Detection and CRM Dashboard",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" }
    ]
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <SessionProvider session={session}>
            <CountryProvider>
              <LayoutWithSnackbar>
                {session ? (
                    <SuperpowersShell>{children}</SuperpowersShell>
                ) : (
                    children
                )}
              </LayoutWithSnackbar>
            </CountryProvider>
          </SessionProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
