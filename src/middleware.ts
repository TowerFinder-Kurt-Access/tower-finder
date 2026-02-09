
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req: any) => {
  const { pathname } = req.nextUrl;

  const isLoggedIn = !!req.auth?.user;

  if (isLoggedIn && pathname === '/login') {
    return Response.redirect(new URL('/', req.url));
  }

  const publicRoutes = ['/login'];
  const publicApiRoutes = ['/api/auth'];

  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route))) {
    return;
  }

  if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
    return;
  }

  if (!isLoggedIn) {
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized - Please login' }, { status: 401 });
    }

    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }
  return;
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
