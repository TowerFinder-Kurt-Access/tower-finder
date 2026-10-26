import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { issueLoginOtp } from '@/lib/otp';
import { isOtpSendBudgetExhausted, recordLoginEvent, requestIp } from '@/lib/login-security';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/users/[id]/email-change-code — send a confirmation code to the
// current address before an email change. The owner needs the current
// password and access to the old inbox.
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const currentUser = await getAuthUser();
        const { id } = await params;
        const userId = parseInt(id);
        if (currentUser.id !== userId) {
            return NextResponse.json({ error: 'You can only change your own email address' }, { status: 403 });
        }

        const body = await request.json();
        const currentPassword = body?.currentPassword;
        if (!currentPassword) {
            return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
        }

        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, password: true },
        });
        if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.password))) {
            return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
        }

        if (await isOtpSendBudgetExhausted(dbUser.email)) {
            return NextResponse.json({ error: 'Too many codes sent. Try again later.' }, { status: 429 });
        }

        const issued = await issueLoginOtp(dbUser.email, 'email-change');
        if (issued.cooldownRemainingSeconds > 0) {
            return NextResponse.json(
                { error: 'A code was already sent. Wait before requesting another.', remainingSeconds: issued.cooldownRemainingSeconds },
                { status: 429 },
            );
        }
        if (issued.deliveryResult && !issued.deliveryResult.ok) {
            return NextResponse.json({ error: 'Could not send the code. Try again.' }, { status: 502 });
        }

        await recordLoginEvent({
            email: dbUser.email,
            userId,
            type: 'OTP_SENT',
            ip: requestIp(request),
            userAgent: request.headers.get('user-agent'),
            metadata: { purpose: 'email_change', resendStatus: issued.deliveryResult?.resendStatus },
        }).catch(() => {});

        return NextResponse.json({ sent: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('[email-change-code] failed:', error);
        return NextResponse.json({ error: 'Could not send the code.' }, { status: 500 });
    }
}
