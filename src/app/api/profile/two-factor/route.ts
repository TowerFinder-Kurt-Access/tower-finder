import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { issueLoginOtp, verifyLoginOtp } from '@/lib/otp';

// GET /api/profile/two-factor — current opt-in state for the profile page.
export async function GET() {
    try {
        const user = await getAuthUser();
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { twoFactorEnabled: true },
        });
        return NextResponse.json({ twoFactorEnabled: dbUser?.twoFactorEnabled ?? false });
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}

interface TwoFactorBody {
    action: 'enable' | 'verify' | 'disable';
    code?: string;
}

// POST /api/profile/two-factor
//   { action: 'enable' }          -> emails a code; must be verified before it turns on
//   { action: 'verify', code }    -> code proven -> twoFactorEnabled = true
//   { action: 'disable' }         -> sends OTP for confirmation (no code) or verifies it (with code)
//   { action: 'disable', code }   -> verifies OTP -> twoFactorEnabled = false
export async function POST(request: Request) {
    let user;
    try {
        user = await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: TwoFactorBody;
    try {
        body = (await request.json()) as TwoFactorBody;
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    try {
        if (body.action === 'enable') {
            // Reuses the same LoginOtp row + cooldown as the login flow.
            const issued = await issueLoginOtp(user.email);
            if (issued.cooldownRemainingSeconds > 0) {
                return NextResponse.json(
                    { error: 'A code was already sent. Wait before requesting another.', code: 'otp_cooldown', remainingSeconds: issued.cooldownRemainingSeconds },
                    { status: 429 }
                );
            }
            return NextResponse.json({ status: 'otp_sent' });
        }

        if (body.action === 'verify') {
            const code = (body.code ?? '').trim();
            if (!/^\d{6}$/.test(code)) {
                return NextResponse.json({ error: 'Enter the 6-digit code', code: 'otp_invalid' }, { status: 400 });
            }
            const verified = await verifyLoginOtp(user.email, code);
            if (verified.ok === false) {
                const message =
                    verified.reason === 'max_attempts'
                        ? 'Too many wrong codes. Request a new one.'
                        : verified.reason === 'invalid'
                          ? 'Incorrect code. Try again.'
                          : 'That code expired or was already used — request a new one.';
                return NextResponse.json({ error: message, code: `otp_${verified.reason}` }, { status: 400 });
            }
            const updated = await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorEnabled: true },
            });
            return NextResponse.json({ twoFactorEnabled: updated.twoFactorEnabled });
        }

        if (body.action === 'disable') {
            const code = (body.code ?? '').trim();
            // Step 1: no code yet -> send OTP for confirmation
            if (!code) {
                const issued = await issueLoginOtp(user.email);
                if (issued.cooldownRemainingSeconds > 0) {
                    return NextResponse.json(
                        { error: 'A code was already sent. Wait before requesting another.', code: 'otp_cooldown', remainingSeconds: issued.cooldownRemainingSeconds },
                        { status: 429 }
                    );
                }
                return NextResponse.json({ status: 'otp_sent' });
            }
            // Step 2: code provided -> verify then disable
            if (!/^\d{6}$/.test(code)) {
                return NextResponse.json({ error: 'Enter the 6-digit code', code: 'otp_invalid' }, { status: 400 });
            }
            const verified = await verifyLoginOtp(user.email, code);
            if (verified.ok === false) {
                const message =
                    verified.reason === 'max_attempts'
                        ? 'Too many wrong codes. Request a new one.'
                        : verified.reason === 'invalid'
                          ? 'Incorrect code. Try again.'
                          : 'That code expired or was already used — request a new one.';
                return NextResponse.json({ error: message, code: `otp_${verified.reason}` }, { status: 400 });
            }
            const updated = await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorEnabled: false },
            });
            return NextResponse.json({ twoFactorEnabled: updated.twoFactorEnabled });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (err) {
        console.error('[two-factor] failed:', err);
        return NextResponse.json(
            { error: 'Could not send the code. Please try again.', code: 'otp_send_failed' },
            { status: 502 }
        );
    }
}
