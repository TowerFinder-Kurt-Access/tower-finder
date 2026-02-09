
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req: any) => {
  const { pathname } = req.nextUrl;

  // Check if user is authenticated - strictly check for user object
  const isLoggedIn = !!req.auth?.user;

  console.log(`Middleware check: ${pathname} | user: ${req.auth?.user?.email} | isLoggedIn: ${isLoggedIn}`);

  // Redirect authenticated users away from login page
  if (isLoggedIn && pathname === '/login') {
    return Response.redirect(new URL('/', req.url));
  }

  // Public routes that don't require authentication
  const publicRoutes = ['/login'];
  const publicApiRoutes = ['/api/auth'];

  // Allow public routes
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route))) {
    return;
  }

  // Allow public API routes
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
    return;
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    console.log(`Redirecting unauthenticated user from ${pathname} to /login`);

    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized - Please login' }, { status: 401 });
    }

    // For page routes, redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }

  // User is authenticated, continue
  return;
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
