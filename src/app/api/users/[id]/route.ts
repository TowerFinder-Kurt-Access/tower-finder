import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireAdmin } from '@/lib/auth-helpers';
import { LoginEventType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { recordLoginEvent, requestIp } from '@/lib/login-security';
import { verifyLoginOtp } from '@/lib/otp';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/users/[id] - Get specific user details
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const currentUser = await getAuthUser();
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
        }

        // Users can view their own profile, admins can view any profile
        if (currentUser.role !== 'ADMIN' && currentUser.id !== userId) {
            return NextResponse.json(
                { error: 'Forbidden - You can only view your own profile' },
                { status: 403 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                twoFactorEnabled: true,
                createdAt: true,
                updatedAt: true,
                lastLogin: true,
                towerAssignments: {
                    include: {
                        tower: {
                            select: {
                                id: true,
                                lat: true,
                                lon: true,
                                status: true,
                                type: true,
                                parcel: {
                                    select: {
                                        address: true,
                                        cityRaw: true,
                                        stateRaw: true,
                                        provinceRaw: true,
                                        postalCode: true,
                                        city: true,
                                        province: true
                                    }
                                }
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        towerAssignments: true,
                        notes: true
                    }
                }
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(user);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching user:', error);
        return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
    }
}

// PATCH /api/users/[id] - Update user
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const currentUser = await getAuthUser();
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
        }

        // Users can update their own profile, admins can update any profile
        const canUpdate = currentUser.role === 'ADMIN' || currentUser.id === userId;
        if (!canUpdate) {
            return NextResponse.json(
                { error: 'Forbidden - You can only update your own profile' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { name, email, role, isActive, currentPassword, emailChangeCode } = body;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!existingUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Build update data
        const updateData: any = {};

        if (name !== undefined) updateData.name = name;

        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
        const emailChanged = normalizedEmail !== undefined
            && normalizedEmail !== existingUser.email.toLowerCase();

        if (emailChanged) {
            // Only the account owner can change the email, and only with the
            // current password. An admin must never repoint a peer's address.
            if (currentUser.id !== userId) {
                return NextResponse.json(
                    { error: 'You can only change your own email address' },
                    { status: 403 }
                );
            }
            if (!currentPassword || !(await bcrypt.compare(currentPassword, existingUser.password))) {
                return NextResponse.json(
                    { error: 'Current password is required to change your email' },
                    { status: 400 }
                );
            }
            if (!emailChangeCode || !/^\d{8}$/.test(emailChangeCode)) {
                return NextResponse.json(
                    { error: 'Enter the 8-digit code sent to your current email' },
                    { status: 400 }
                );
            }
            const codeCheck = await verifyLoginOtp(existingUser.email, emailChangeCode, 'email-change');
            if (codeCheck.ok === false) {
                return NextResponse.json(
                    { error: 'That confirmation code is invalid or expired' },
                    { status: 400 }
                );
            }
            const emailTaken = await prisma.user.findFirst({
                where: {
                    email: { equals: normalizedEmail, mode: 'insensitive' },
                    id: { not: userId }
                }
            });
            if (emailTaken) {
                return NextResponse.json(
                    { error: 'Email already in use by another user' },
                    { status: 409 }
                );
            }
            updateData.email = normalizedEmail;
        }

        // Only admins can change role and isActive
        const deactivating = currentUser.role === 'ADMIN' && isActive === false && existingUser.isActive === true;
        const roleChanged = currentUser.role === 'ADMIN' && role !== undefined && role !== existingUser.role;
        const activeChanged = currentUser.role === 'ADMIN' && isActive !== undefined && isActive !== existingUser.isActive;
        if (currentUser.role === 'ADMIN') {
            if (role !== undefined) updateData.role = role;
            if (isActive !== undefined) updateData.isActive = isActive;
        }

        // Every security-relevant identity change revokes existing sessions.
        if (emailChanged || roleChanged || activeChanged) {
            updateData.sessionVersion = { increment: 1 };
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                lastLogin: true
            }
        });

        if (emailChanged) {
            await prisma.loginOtp.deleteMany({ where: { email: existingUser.email } }).catch(() => {});
            await prisma.passwordResetToken.deleteMany({ where: { email: existingUser.email.toLowerCase() } }).catch(() => {});
        }

        if (deactivating) {
            const ip = requestIp(request);
            await recordLoginEvent({
                email: existingUser.email,
                userId,
                type: LoginEventType.ACCOUNT_DEACTIVATED,
                ip,
                userAgent: request.headers.get('user-agent'),
            });
        }

        return NextResponse.json({ ...updatedUser, emailChanged });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error updating user:', error);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
}

// DELETE /api/users/[id] - Delete user (admin only)
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        // Only admins can delete users
        const currentUser = await requireAdmin();
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
        }

        // Prevent self-deletion
        if (currentUser.id === userId) {
            return NextResponse.json(
                { error: 'You cannot delete your own account' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Delete user (cascade will handle towerAssignments and notes)
        await prisma.user.delete({
            where: { id: userId }
        });

        const ip = requestIp(request);
        await recordLoginEvent({
            email: user.email,
            type: LoginEventType.ACCOUNT_DEACTIVATED,
            ip,
            userAgent: request.headers.get('user-agent'),
        });

        return NextResponse.json({ message: 'User deleted successfully' });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }
}
