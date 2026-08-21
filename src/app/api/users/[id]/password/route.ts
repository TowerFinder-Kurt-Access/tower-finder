import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import bcrypt from 'bcryptjs';
import { LoginEventType } from '@prisma/client';
import { validatePassword } from '@/lib/password-policy';
import { recordLoginEvent, requestIp } from '@/lib/login-security';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/users/[id]/password - Change user password
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const currentUser = await getAuthUser();
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
        }

        // Users can only change their own password (even admins can't change others' passwords for security)
        if (currentUser.id !== userId) {
            return NextResponse.json(
                { error: 'Forbidden - You can only change your own password' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        // Validation
        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: 'Current password and new password are required' },
                { status: 400 }
            );
        }

        const policyError = validatePassword(newPassword);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        // Get user from database
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'Current password is incorrect' },
                { status: 401 }
            );
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password — bump sessionVersion so all existing sessions
        // (including this one) are rejected; the user must sign in again.
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } }
        });

        const ip = requestIp(request);
        await recordLoginEvent({
            email: user.email,
            userId: user.id,
            type: LoginEventType.PASSWORD_CHANGED,
            ip,
            userAgent: request.headers.get('user-agent'),
        });

        return NextResponse.json({ message: 'Password changed successfully' });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error changing password:', error);
        return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
    }
}
