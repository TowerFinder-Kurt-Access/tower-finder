import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

// Two-factor authentication is required for every account: the login flow
// always emails a one-time code. This endpoint only reports that state; it no
// longer accepts enable or disable requests.
export async function GET() {
    try {
        await getAuthUser();
        return NextResponse.json({ twoFactorEnabled: true });
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}

export async function POST() {
    return NextResponse.json(
        { error: 'Two-factor authentication is required for every account.' },
        { status: 403 },
    );
}
