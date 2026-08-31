import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';
import bcrypt from 'bcryptjs';
import { LoginEventType } from '@prisma/client';
import { validatePassword } from '@/lib/password-policy';
import { recordLoginEvent, requestIp } from '@/lib/login-security';
import { LOCKOUT_WINDOW_MS } from '@/lib/security-policy';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/users/[id]/reset-password - Admin resets user password
export async function POST(request: Request, { params }: RouteParams) {
    try {
        // Only admins can reset passwords
        const admin = await requireAdmin();
        const { id } = await params;
        const userId = parseInt(id);

        const body = await request.json();
        const { newPassword } = body;

        if (!newPassword) {
            return NextResponse.json({ error: 'New password is required' }, { status: 400 });
        }

        const policyError = validatePassword(newPassword);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password — bump sessionVersion to sign the user out everywhere
        // and clean up stale OTP rows. 2FA is intentionally preserved: if the user
        // had it enabled, the next login still requires OTP (prevents silent bypass
        // after admin reset — see #10).
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                passwordChangedAt: new Date(),
                sessionVersion: { increment: 1 },
                mustChangePassword: true,
            }
        });

        // Clean up any pending OTP codes for this email so stale rows
        // don't interfere with the next login attempt.
        await prisma.loginOtp.deleteMany({ where: { email: user.email } }).catch(() => {});

        // Clear the lockout counter by deleting recent failed-login events.
        // This gives the user a fresh start after the admin override.
        await prisma.loginEvent.deleteMany({
            where: {
                email: user.email,
                type: LoginEventType.LOGIN_FAILED,
                createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
            },
        }).catch(() => {});

        const ip = requestIp(request);
        await recordLoginEvent({
            email: user.email,
            userId: user.id,
            type: LoginEventType.PASSWORD_RESET,
            ip,
            userAgent: request.headers.get('user-agent'),
        });

        console.log(`Admin ${admin.id} reset password for user ${userId}`);

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        console.error('Error resetting password:', error);
        return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
    }
}
