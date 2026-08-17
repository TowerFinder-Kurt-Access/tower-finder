import { NextRequest, NextResponse } from 'next/server';
import { getLockoutRemainingSeconds } from '@/lib/login-security';

// GET /api/auth/lockout-status?email=... - Public by design: it exposes only
// the same lock state the login form already reveals, and lets the login page
// show the real remaining lockout time (it can't be derived client-side).
export async function GET(request: NextRequest) {
    const email = request.nextUrl.searchParams.get('email');
    if (!email) return NextResponse.json({ remainingSeconds: 0 });
    const remainingSeconds = await getLockoutRemainingSeconds(email);
    return NextResponse.json({ remainingSeconds });
}