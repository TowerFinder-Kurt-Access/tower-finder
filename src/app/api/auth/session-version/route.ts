import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/auth/session-version - Internal endpoint for edge middleware to
// detect revoked sessions (deactivated user, password reset/change bumped the
// user's sessionVersion in the DB). 401 means the JWT is stale. A database
// failure returns 500 so the middleware fails open instead of logging everyone
// out on a transient error.
export async function GET() {
    try {
        await getAuthUser();
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('[session-version] check failed:', error);
        return NextResponse.json({ error: 'Session check failed' }, { status: 500 });
    }
}