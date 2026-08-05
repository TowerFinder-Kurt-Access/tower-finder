import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, getAuthUser } from '@/lib/auth-helpers';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-policy';

// GET /api/users - List all users (admin only)
export async function GET(request: Request) {
    try {
        // Only admins can list users
        await requireAdmin();

        const { searchParams } = new URL(request.url);
        const includeAssignments = searchParams.get('includeAssignments') === 'true';

        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                lastLogin: true,
                ...(includeAssignments && {
                    towerAssignments: {
                        include: {
                            tower: {
                                select: {
                                    id: true,
                                    lat: true,
                                    lon: true,
                                    status: true,
                                    type: true
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
                })
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(users);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

// POST /api/users - Create a new user (admin only)
export async function POST(request: Request) {
    try {
        // Only admins can create users
        await requireAdmin();

        const body = await request.json();
        const { email, name, password, role, isActive } = body;

        // Validation
        if (!email || !name || !password) {
            return NextResponse.json(
                { error: 'Email, name, and password are required' },
                { status: 400 }
            );
        }

        const policyError = validatePassword(password);
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'User with this email already exists' },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                role: role || 'CALLER',
                isActive: isActive !== undefined ? isActive : true,
                passwordChangedAt: new Date()
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true
            }
        });

        return NextResponse.json(user, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error creating user:', error);
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
}
