import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-policy';
import { recordLoginEvent, requestIp } from '@/lib/login-security';

const MAX_CODE_ATTEMPTS = 5;

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

// POST /api/auth/reset-password — { email, code, password, confirmPassword }
export async function POST(request: Request) {
    try {
        let body: { email?: string; code?: string; password?: string; confirmPassword?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        const { email, code, password, confirmPassword } = body ?? {};

        if (!email || !code || !password || !confirmPassword) {
            return NextResponse.json({ error: 'Email, code, password, and confirmation are required' }, { status: 400 });
        }

        if (!/^\d{6}$/.test(code)) {
            return NextResponse.json({ error: 'Code must be 6 digits' }, { status: 400 });
        }

        if (password !== confirmPassword) {
            return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
        }

        const policyError = validatePassword(password);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        // Find the most recent reset code for this email.
        const resetToken = await prisma.passwordResetToken.findFirst({
            where: { email: email.trim().toLowerCase() },
            orderBy: { createdAt: 'desc' },
        });

        if (!resetToken) {
            return NextResponse.json({ error: 'No reset code found. Please request a new one.' }, { status: 400 });
        }

        if (resetToken.expiresAt.getTime() < Date.now()) {
            await prisma.passwordResetToken.delete({ where: { id: resetToken.id } }).catch(() => {});
            return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 });
        }

        if (resetToken.attempts >= MAX_CODE_ATTEMPTS) {
            await prisma.passwordResetToken.delete({ where: { id: resetToken.id } }).catch(() => {});
            return NextResponse.json({ error: 'Too many failed attempts. Please request a new code.' }, { status: 400 });
        }

        // Constant-time comparison.
        const provided = Buffer.from(sha256(code), 'hex');
        const stored = Buffer.from(resetToken.codeHash, 'hex');
        const valid = provided.length === stored.length && timingSafeEqual(provided, stored);

        if (!valid) {
            await prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { attempts: { increment: 1 } },
            });
            const remaining = MAX_CODE_ATTEMPTS - (resetToken.attempts + 1);
            return NextResponse.json({
                error: remaining > 0
                    ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
                    : 'Too many failed attempts. Please request a new code.',
            }, { status: 400 });
        }

        // Code is valid — find the user and update password.
        const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } } });
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordChangedAt: new Date(),
                sessionVersion: { increment: 1 },
            },
        });

        // Clean up: delete this code and any others for this email.
        await prisma.passwordResetToken.deleteMany({ where: { email: email.trim().toLowerCase() } }).catch(() => {});

        // Clean up stale OTP rows.
        await prisma.loginOtp.deleteMany({ where: { email: email.trim().toLowerCase() } }).catch(() => {});

        const ip = requestIp(request);
        await recordLoginEvent({
            email: email.trim().toLowerCase(),
            userId: user.id,
            type: 'PASSWORD_RESET',
            ip,
            userAgent: request.headers.get('user-agent'),
            metadata: { action: 'self_service_reset_completed' },
        }).catch(() => {});

        return NextResponse.json({
            message: 'Password reset successfully. You can now sign in with your new password.',
        });
    } catch (err) {
        console.error('[reset-password] POST failed:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
