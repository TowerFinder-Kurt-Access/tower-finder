import { NextResponse } from 'next/server';
import { LoginEventType } from '@prisma/client';
import { auth } from '@/lib/auth';
import { getAuthUser } from '@/lib/auth-helpers';
import { recordLoginEvent, requestIp } from '@/lib/login-security';

/** A successful check is reused for this long. Middleware calls this endpoint
 *  on every request, and the pool is small, so a check per request exhausted
 *  it. A revoked session is still rejected within this window. */
const OK_TTL_MS = 1_000;

/** One revocation record per session version, so middleware's per-request
 *  check does not flood the audit log. */
const REVOKED_TTL_MS = 60_000;

const okUntil = new Map<string, number>();
const revokedUntil = new Map<string, number>();

async function recordRevoked(
    email: string,
    userId: number | null,
    sessionVersion: number | null,
    request: Request
): Promise<void> {
    const key = `${email}:${sessionVersion ?? 0}`;
    const now = Date.now();
    if ((revokedUntil.get(key) ?? 0) > now) return;

    if (revokedUntil.size > 500) revokedUntil.clear();
    revokedUntil.set(key, now + REVOKED_TTL_MS);

    await recordLoginEvent({
        email,
        userId: userId !== null && Number.isFinite(userId) ? userId : undefined,
        type: LoginEventType.SESSION_REVOKED,
        ip: requestIp(request),
        metadata: { reason: 'session_version_mismatch' },
    }).catch(() => {});
}

// GET /api/auth/session-version - Internal endpoint for edge middleware to
// detect revoked sessions (deactivated user, password reset/change bumped the
// user's sessionVersion in the DB). 401 means the JWT is stale. A database
// failure returns 500 so the middleware fails open instead of logging everyone
// out on a transient error.
export async function GET(request: Request) {
    let email: string | null = null;
    let userId: number | null = null;
    let sessionVersion: number | null = null;

    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        email = session.user.email;
        userId = Number.parseInt(session.user.id, 10);
        sessionVersion = session.user.sessionVersion;

        const key = `${session.user.id}:${session.user.sessionVersion}`;
        const now = Date.now();
        const cached = okUntil.get(key);
        if (cached !== undefined && cached > now) {
            return NextResponse.json({ ok: true });
        }

        await getAuthUser();

        if (okUntil.size > 500) okUntil.clear();
        okUntil.set(key, now + OK_TTL_MS);
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            if (email) await recordRevoked(email, userId, sessionVersion, request);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('[session-version] check failed:', error);
        return NextResponse.json({ error: 'Session check failed' }, { status: 500 });
    }
}
