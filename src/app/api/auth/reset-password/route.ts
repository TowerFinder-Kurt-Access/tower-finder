import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-policy';
import { markPasswordPolicyCurrent } from '@/lib/password-policy-server';
import { LOCKOUT_WINDOW_MS } from '@/lib/security-policy';
import { recordLoginEvent, requestIp, isIpRateLimited, isResetAttemptBudgetExhausted } from '@/lib/login-security';

const MAX_CODE_ATTEMPTS = 5;

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

// POST /api/auth/reset-password — { email, code, password, confirmPassword }
export async function POST(request: Request) {
    try {
        const clientIp = requestIp(request);
        if (isIpRateLimited(clientIp, 10, 60_000)) {
            return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
        }

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

        if (!/^\d{8}$/.test(code)) {
            return NextResponse.json({ error: 'Code must be 8 digits' }, { status: 400 });
        }

        if (password !== confirmPassword) {
            return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
        }

        const policyError = validatePassword(password);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (await isResetAttemptBudgetExhausted(normalizedEmail)) {
            return NextResponse.json({ error: 'Too many failed attempts. Try again later.' }, { status: 429 });
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
            // Keep the row so the forgot-password cooldown still applies.
            await recordLoginEvent({
                email: normalizedEmail,
                type: 'PASSWORD_RESET',
                ip: clientIp,
                userAgent: request.headers.get('user-agent'),
                metadata: { action: 'reset_code_exhausted', reason: 'expired' },
            }).catch(() => {});
            return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 });
        }

        // Claim one attempt atomically before comparing. A burst of guesses
        // can no longer all read attempts=0; only MAX_CODE_ATTEMPTS claims win.
        const claimed = await prisma.passwordResetToken.updateMany({
            where: { id: resetToken.id, attempts: { lt: MAX_CODE_ATTEMPTS } },
            data: { attempts: { increment: 1 } },
        });

        if (claimed.count === 0) {
            const stillExists = await prisma.passwordResetToken.findUnique({ where: { id: resetToken.id } });
            if (!stillExists) {
                return NextResponse.json({ error: 'No reset code found. Please request a new one.' }, { status: 400 });
            }
            await recordLoginEvent({
                email: normalizedEmail,
                type: 'PASSWORD_RESET',
                ip: clientIp,
                userAgent: request.headers.get('user-agent'),
                metadata: { action: 'reset_code_exhausted', reason: 'max_attempts' },
            }).catch(() => {});
            return NextResponse.json({ error: 'Too many failed attempts. Please request a new code.' }, { status: 400 });
        }

        // Constant-time comparison.
        const provided = Buffer.from(sha256(code), 'hex');
        const stored = Buffer.from(resetToken.codeHash, 'hex');
        const valid = provided.length === stored.length && timingSafeEqual(provided, stored);

        if (!valid) {
            const remaining = Math.max(0, MAX_CODE_ATTEMPTS - (resetToken.attempts + 1));
            await recordLoginEvent({
                email: normalizedEmail,
                type: 'PASSWORD_RESET',
                ip: clientIp,
                userAgent: request.headers.get('user-agent'),
                metadata: { action: 'reset_code_failed' },
            }).catch(() => {});
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
                // A completed reset is the change, so the forced-change gate lifts.
                mustChangePassword: false,
            },
        });

        // A fresh password ends the failed-login lockout. Without this, a user
        // who reset while locked out stayed blocked for the rest of the window.
        await prisma.loginEvent.deleteMany({
            where: {
                OR: [
                    { userId: user.id },
                    { email: { equals: email.trim(), mode: 'insensitive' } },
                ],
                type: 'LOGIN_FAILED',
                createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
            },
        }).catch(() => {});

        // Clean up: delete this code and any others for this email.
        await prisma.passwordResetToken.deleteMany({ where: { email: email.trim().toLowerCase() } }).catch(() => {});

        // Clean up stale OTP rows, including the email-change namespace.
        await prisma.loginOtp.deleteMany({
            where: { email: { in: [normalizedEmail, `${normalizedEmail}#email-change`] } },
        }).catch(() => {});

        await markPasswordPolicyCurrent(user.id);

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
