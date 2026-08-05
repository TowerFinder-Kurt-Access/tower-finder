import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/auth/session-version - Internal endpoint for edge middleware to
// detect revoked sessions (deactivated user, password reset/change bumped the
// user's sessionVersion in the DB). 401 means the JWT is stale.
export async function GET() {
    try {
        await getAuthUser();
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}