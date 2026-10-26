import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthUser } from '@/lib/auth-helpers';

/** A successful check is reused for this long. Middleware calls this endpoint
 *  on every request, and the pool is small, so a check per request exhausted
 *  it. A revoked session is still rejected within this window. */
const OK_TTL_MS = 10_000;

const okUntil = new Map<string, number>();

// GET /api/auth/session-version - Internal endpoint for edge middleware to
// detect revoked sessions (deactivated user, password reset/change bumped the
// user's sessionVersion in the DB). 401 means the JWT is stale. A database
// failure returns 500 so the middleware fails open instead of logging everyone
// out on a transient error.
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('[session-version] check failed:', error);
        return NextResponse.json({ error: 'Session check failed' }, { status: 500 });
    }
}
