import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireAdmin } from '@/lib/auth-helpers';

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
        const { name, email, role, isActive } = body;

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
        if (email !== undefined) {
            // Check if email is already taken by another user
            const emailTaken = await prisma.user.findFirst({
                where: {
                    email,
                    id: { not: userId }
                }
            });
            if (emailTaken) {
                return NextResponse.json(
                    { error: 'Email already in use by another user' },
                    { status: 409 }
                );
            }
            updateData.email = email;
        }

        // Only admins can change role and isActive
        if (currentUser.role === 'ADMIN') {
            if (role !== undefined) updateData.role = role;
            if (isActive !== undefined) updateData.isActive = isActive;
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

        return NextResponse.json(updatedUser);
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
