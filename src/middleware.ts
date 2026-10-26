import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth(async (req: any) => {
    const isLoggedIn = !!req.auth?.user;
    const { pathname } = req.nextUrl;

    // 1. Auth API routes always pass through (the login flow needs them).
    if (pathname.startsWith('/api/auth')) {
        return;
    }

    // 2. Revocation check: deactivation / password reset / password change bump
    //    the user's sessionVersion in the DB. Edge middleware can't query it
    //    directly, so we ask the server-side session endpoint with our cookies.
    //    Skipped on /login itself so a slow check never traps users there.
    let revoked = false;
    let revocationCheckFailed = false;
    if (isLoggedIn && pathname !== '/login') {
        try {
            const res = await fetch(new URL('/api/auth/session-version', req.url), {
                headers: { cookie: req.headers.get('cookie') ?? '' },
                signal: AbortSignal.timeout(5000),
            });
            revoked = res.status === 401;
        } catch {
            // Fail open for reads so a slow dev compile or brief DB blip does
            // not log everyone out. State-changing API calls fail closed below.
            revoked = false;
            revocationCheckFailed = true;
        }
    }

    if (revoked) {
        if (pathname !== '/login') {
            // API routes get a clean 401 so clients don't choke on a redirect;
            // pages get bounced to the login page with a reason. The stale
            // cookie cannot be cleared here: the NextAuth wrapper re-issues it
            // after this handler returns. The login page clears it instead.
            if (pathname.startsWith('/api/')) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const loginUrl = new URL('/login', req.url);
            loginUrl.searchParams.set('error', 'session-revoked');
            return Response.redirect(loginUrl);
        }
        return; // already on the login page: let it render
    }

    // 2b. Force password change: after an admin reset the user must pick a
    //     new password before accessing anything else.
    const forcedChange = !!req.auth?.user?.forcedPasswordChange;
    if (isLoggedIn && forcedChange && pathname !== '/change-password' && !pathname.startsWith('/api/')) {
        return Response.redirect(new URL('/change-password', req.url));
    }

    // A failed revocation check is not a licence to write. Reads keep working;
    // state-changing API calls get a retryable 503.
    if (revocationCheckFailed && isLoggedIn && pathname.startsWith('/api/')
        && req.method !== 'GET' && req.method !== 'HEAD') {
        return Response.json(
            { error: 'Session check unavailable. Try again.', code: 'session_check_unavailable' },
            { status: 503 },
        );
    }

    // 2c. Forced password change also blocks API traffic, except the password
    //     endpoint itself (and auth routes, which returned above).
    if (isLoggedIn && forcedChange && pathname.startsWith('/api/')) {
        const allowed = /^\/api\/users\/[^/]+\/password\/?$/.test(pathname);
        if (!allowed) {
            return Response.json(
                { error: 'Password change required.', code: 'password_change_required' },
                { status: 403 },
            );
        }
    }

    // 2c. 2FA activation is enforced for API traffic too, not just the shell.
    //     The JWT carries the flag, so this costs no DB round trip. Auth and
    //     enrollment endpoints stay open; the password page needs its own
    //     endpoint before the setup screen can be cleared.
    if (isLoggedIn && req.auth?.user?.twoFactorEnabled === false && pathname.startsWith('/api/')) {
        const allowed =
            pathname === '/api/profile/two-factor' ||
            /^\/api\/users\/[^/]+\/password\/?$/.test(pathname);
        if (!allowed) {
            return Response.json(
                { error: 'Two-factor authentication setup required.', code: 'two_factor_required' },
                { status: 403 },
            );
        }
    }

    // 3. Valid sessions visiting /login go home. A revoked session also arrives
    //    here holding a valid JWT, so sending it home would bounce straight back.
    const sessionRevoked = req.nextUrl.searchParams.get('error') === 'session-revoked';
    if (isLoggedIn && pathname === '/login' && !sessionRevoked) {
        return Response.redirect(new URL('/', req.url));
    }

    // 4. Allow cron + worker jobs to bypass auth (secured by CRON_SECRET check in the handler)
    if (pathname.startsWith('/api/cron') || pathname.startsWith('/api/worker')) {
        return;
    }

    // 5. Protect everything else (the login page itself always renders)
    if (!isLoggedIn && pathname !== '/login') {
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return Response.redirect(loginUrl);
    }
});

export const config = {
    // The MapLibre worker is a static asset that the browser fetches directly.
    // Middleware must let it through, or it gets redirected to /login and the
    // map never paints.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg|maplibre-gl-worker.mjs).*)'],
};