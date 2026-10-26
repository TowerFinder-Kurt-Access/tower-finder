import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { issueLoginOtp, verifyLoginOtp } from '@/lib/otp';
import { isOtpSendBudgetExhausted, recordLoginEvent, requestIp } from '@/lib/login-security';

// GET /api/profile/two-factor — current activation state.
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
//   { action: 'enable' }        -> emails a code; activation waits for verify
//   { action: 'verify', code }  -> code proven, twoFactorEnabled = true
//   disable is blocked: once activated, 2FA stays on.
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

    if (body.action === 'disable') {
        return NextResponse.json(
            { error: 'Two-factor authentication cannot be turned off once enabled.' },
            { status: 403 },
        );
    }

    try {
        if (body.action === 'enable') {
            if (await isOtpSendBudgetExhausted(user.email)) {
                return NextResponse.json(
                    { error: 'Too many codes sent. Try again later.', code: 'otp_cooldown' },
                    { status: 429 },
                );
            }
            const issued = await issueLoginOtp(user.email);
            if (issued.cooldownRemainingSeconds > 0) {
                return NextResponse.json(
                    {
                        error: 'A code was already sent. Wait before requesting another.',
                        code: 'otp_cooldown',
                        remainingSeconds: issued.cooldownRemainingSeconds,
                    },
                    { status: 429 },
                );
            }
            if (issued.deliveryResult && !issued.deliveryResult.ok) {
                return NextResponse.json(
                    { error: 'Could not send the code. Try again.', code: 'otp_send_failed' },
                    { status: 502 },
                );
            }
            await recordLoginEvent({
                email: user.email,
                userId: user.id,
                type: 'OTP_SENT',
                ip: requestIp(request),
                userAgent: request.headers.get('user-agent'),
                metadata: { purpose: 'two_factor_setup', resendStatus: issued.deliveryResult?.resendStatus },
            }).catch(() => {});
            return NextResponse.json({ sent: true });
        }

        if (body.action === 'verify') {
            if (!body.code || !/^\d{8}$/.test(body.code)) {
                return NextResponse.json({ error: 'Enter the 8-digit code.' }, { status: 400 });
            }

            const verified = await verifyLoginOtp(user.email, body.code);
            if (verified.ok === false) {
                const message = verified.reason === 'invalid'
                    ? 'That code is not correct.'
                    : verified.reason === 'max_attempts'
                        ? 'Too many attempts. Request a new code.'
                        : 'That code expired. Request a new one.';
                return NextResponse.json({ error: message }, { status: 400 });
            }

            const updated = await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorEnabled: true, sessionVersion: { increment: 1 } },
            });
            return NextResponse.json({ twoFactorEnabled: updated.twoFactorEnabled });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[two-factor] POST failed:', error);
        return NextResponse.json({ error: 'Could not complete 2FA setup.' }, { status: 500 });
    }
}
