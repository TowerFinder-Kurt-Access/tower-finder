import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, randomBytes } from 'crypto';
import { sendEmail, resetPasswordEmailHtml } from '@/lib/email';
import { recordLoginEvent, requestIp } from '@/lib/login-security';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

// POST /api/auth/forgot-password — { email }
// Always returns 200 with the same message to prevent email enumeration.
export async function POST(request: Request) {
    let body: { email?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Always return the same response regardless of whether the user exists.
    const successResponse = NextResponse.json({
        message: 'If an account with that email exists, you will receive a password reset link shortly.',
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
        return successResponse;
    }

    // Invalidate any previous reset tokens for this email.
    await prisma.passwordResetToken.deleteMany({ where: { email } }).catch(() => {});

    // Generate a cryptographically random token and store only the hash.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
        data: { email, tokenHash, expiresAt },
    });

    // Build the reset URL — the raw token goes in the query string.
    const origin = request.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? 'https://tower-finder.vercel.app';
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;

    const delivery = await sendEmail(
        email,
        'Reset your Tower Finder password',
        resetPasswordEmailHtml({ resetUrl, expiresInMinutes: TOKEN_TTL_MS / 60_000 }),
        { resetUrl, expiresInMinutes: String(TOKEN_TTL_MS / 60_000) },
    );

    const ip = requestIp(request);
    await recordLoginEvent({
        email,
        userId: user.id,
        type: 'PASSWORD_RESET',
        ip,
        userAgent: request.headers.get('user-agent'),
        metadata: {
            action: 'forgot_password_requested',
            resendStatus: delivery.resendStatus,
            resendId: delivery.resendId,
            resendError: delivery.resendError,
            devFallback: delivery.devFallback ?? false,
        },
    }).catch(() => {});

    return successResponse;
}
