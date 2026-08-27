import { NextRequest, NextResponse } from 'next/server';
import { getLockoutRemainingSeconds, isIpRateLimited, requestIp } from '@/lib/login-security';

// GET /api/auth/lockout-status?email=... - Public by design: it exposes only
// the same lock state the login form already reveals, and lets the login page
// show the real remaining lockout time (it can't be derived client-side).
export async function GET(request: NextRequest) {
    // IP rate limit: 10/min — prevents enumeration oracle abuse
    const ip = requestIp(request);
    if (isIpRateLimited(ip, 10, 60_000)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    const email = request.nextUrl.searchParams.get('email');
    if (!email) return NextResponse.json({ remainingSeconds: 0 });
    const remainingSeconds = await getLockoutRemainingSeconds(email);
    return NextResponse.json({ remainingSeconds });
}