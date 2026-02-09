
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req: any) => {
  const { pathname } = req.nextUrl;

  const isLoggedIn = !!req.auth?.user;

  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  } else {
    if (isLoggedIn && pathname === '/login') {
      return Response.redirect(new URL('/', req.url));
    }
    if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
      return;
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
