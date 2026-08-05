import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

interface MiddlewareUser {
    id: string;
    email: string;
    name: string;
    role: string;
    mustChangePassword?: boolean;
}

export default auth(async (req: any) => {
    const isLoggedIn = !!req.auth?.user;
    const { pathname } = req.nextUrl;
    const user = req.auth?.user as MiddlewareUser | undefined;

    // 1. Auth API routes always pass through (the login flow needs them).
    if (pathname.startsWith('/api/auth')) {
        return;
    }

    // 2. Revocation check: deactivation / password reset / password change bump
    //    the user's sessionVersion in the DB. Edge middleware can't query it
    //    directly, so we ask the server-side session endpoint with our cookies.
    let revoked = false;
    if (isLoggedIn) {
        try {
            const res = await fetch(new URL('/api/auth/session-version', req.url), {
                headers: { cookie: req.headers.get('cookie') ?? '' },
                signal: AbortSignal.timeout(2000),
            });
            revoked = res.status === 401;
        } catch {
            revoked = false; // fail open on network errors, never lock everyone out
        }
    }

    if (revoked) {
        if (pathname !== '/login') {
            // API routes get a clean 401 so clients don't choke on a redirect;
            // pages get bounced to the login page with a reason.
            if (pathname.startsWith('/api/')) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const loginUrl = new URL('/login', req.url);
            loginUrl.searchParams.set('error', 'session-revoked');
            return Response.redirect(loginUrl);
        }
        return; // already on the login page: let it render
    }

    // 3. Valid sessions visiting /login go home.
    if (isLoggedIn && pathname === '/login') {
        return Response.redirect(new URL('/', req.url));
    }

    // 4. Allow cron jobs to bypass auth (secured by CRON_SECRET check in the handler)
    if (pathname.startsWith('/api/cron')) {
        return;
    }

    // 5. Passwords older than 180 days must be changed: pin users to /profile
    if (isLoggedIn && user?.mustChangePassword && pathname !== '/profile') {
        return Response.redirect(new URL('/profile?changePassword=1', req.url));
    }

    // 6. Protect everything else (the login page itself always renders)
    if (!isLoggedIn && pathname !== '/login') {
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return Response.redirect(loginUrl);
    }
});

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};