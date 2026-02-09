import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

// POST /api/tower-assignments - Assign towers to user (admin only)
export async function POST(request: Request) {
    try {
        const admin = await requireAdmin();
        const body = await request.json();
        const { userId, towerIds } = body;

        // Validation
        if (!userId || !Array.isArray(towerIds) || towerIds.length === 0) {
            return NextResponse.json(
                { error: 'userId and towerIds array are required' },
                { status: 400 }
            );
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Create assignments (using createMany will skip duplicates)
        const assignments = await prisma.towerAssignment.createMany({
            data: towerIds.map((towerId: number) => ({
                userId,
                towerId,
                assignedBy: admin.id
            })),
            skipDuplicates: true
        });

        return NextResponse.json({
            message: `Successfully assigned ${assignments.count} towers to user`,
            count: assignments.count
        }, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error creating tower assignments:', error);
        return NextResponse.json({ error: 'Failed to create tower assignments' }, { status: 500 });
    }
}

// DELETE /api/tower-assignments - Remove tower assignments (admin only)
export async function DELETE(request: Request) {
    try {
        await requireAdmin();
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const towerId = searchParams.get('towerId');

        if (!userId) {
            return NextResponse.json(
                { error: 'userId query parameter is required' },
                { status: 400 }
            );
        }

        const userIdInt = parseInt(userId);

        // If towerId is provided, remove specific assignment
        if (towerId) {
            const towerIdInt = parseInt(towerId);
            await prisma.towerAssignment.deleteMany({
                where: {
                    userId: userIdInt,
                    towerId: towerIdInt
                }
            });
            return NextResponse.json({ message: 'Tower assignment removed successfully' });
        }

        // If no towerId, remove all assignments for the user
        const result = await prisma.towerAssignment.deleteMany({
            where: { userId: userIdInt }
        });

        return NextResponse.json({
            message: `Successfully removed ${result.count} tower assignments`,
            count: result.count
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error removing tower assignments:', error);
        return NextResponse.json({ error: 'Failed to remove tower assignments' }, { status: 500 });
    }
}

// GET /api/tower-assignments - Get assignments (admin only)
export async function GET(request: Request) {
    try {
        await requireAdmin();
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const towerId = searchParams.get('towerId');

        let whereClause: any = {};

        if (userId) {
            whereClause.userId = parseInt(userId);
        }

        if (towerId) {
            whereClause.towerId = parseInt(towerId);
        }

        const assignments = await prisma.towerAssignment.findMany({
            where: whereClause,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true
                    }
                },
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
                                city: true,
                                state: true
                            }
                        }
                    }
                }
            },
            orderBy: { assignedAt: 'desc' }
        });

        return NextResponse.json(assignments);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching tower assignments:', error);
        return NextResponse.json({ error: 'Failed to fetch tower assignments' }, { status: 500 });
    }
}
