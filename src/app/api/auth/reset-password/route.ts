import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-policy';
import { recordLoginEvent, requestIp } from '@/lib/login-security';

const TOKEN_TTL_MS = 60 * 60 * 1000; // must match forgot-password

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

// POST /api/auth/reset-password — { token, password, confirmPassword }
export async function POST(request: Request) {
    let body: { token?: string; password?: string; confirmPassword?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { token, password, confirmPassword } = body ?? {};

    if (!token || !password || !confirmPassword) {
        return NextResponse.json({ error: 'Token, password, and confirmation are required' }, { status: 400 });
    }

    if (password !== confirmPassword) {
        return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    const policyError = validatePassword(password);
    if (policyError) {
        return NextResponse.json({ error: policyError }, { status: 400 });
    }

    // Look up the token by hash.
    const tokenHash = sha256(token);
    const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
    });

    if (!resetToken) {
        return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    if (resetToken.expiresAt.getTime() < Date.now()) {
        // Token expired — clean it up and reject.
        await prisma.passwordResetToken.delete({ where: { id: resetToken.id } }).catch(() => {});
        return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    const email = resetToken.email;

    // Find the user.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Hash the new password.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password, bump sessionVersion (revokes all existing sessions),
    // disable 2FA, and clean up stale OTP rows — same safety as admin reset.
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            passwordChangedAt: new Date(),
            sessionVersion: { increment: 1 },
            twoFactorEnabled: false,
        },
    });

    // Clean up: delete this token and any others for this email.
    await prisma.passwordResetToken.deleteMany({ where: { email } }).catch(() => {});

    // Clean up stale OTP rows.
    await prisma.loginOtp.deleteMany({ where: { email } }).catch(() => {});

    const ip = requestIp(request);
    await recordLoginEvent({
        email,
        userId: user.id,
        type: 'PASSWORD_RESET',
        ip,
        userAgent: request.headers.get('user-agent'),
        metadata: { action: 'self_service_reset_completed' },
    }).catch(() => {});

    return NextResponse.json({
        message: 'Password reset successfully. You can now sign in with your new password.',
    });
}
