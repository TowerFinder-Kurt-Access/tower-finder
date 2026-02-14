
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req: any) => {
  const isLoggedIn = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  // 1. Handle auth/login routes
  if (pathname.startsWith('/api/auth') || pathname === '/login') {
    if (isLoggedIn && pathname === '/login') {
      return Response.redirect(new URL('/', req.url));
    }
    return;
  }

  // 2. Allow cron jobs to bypass auth (secured by CRON_SECRET check in the handler)
  if (pathname.startsWith('/api/cron')) {
    return;
  }

  // 3. Protect everything else
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
