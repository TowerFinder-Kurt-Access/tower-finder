import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await getAuthUser();
        const { id } = await params;
        const towerId = parseInt(id);

        // Get previous and next tower IDs
        const [prev, next] = await Promise.all([
            prisma.tower.findFirst({
                where: { id: { lt: towerId } },
                orderBy: { id: 'desc' },
                select: { id: true }
            }),
            prisma.tower.findFirst({
                where: { id: { gt: towerId } },
                orderBy: { id: 'asc' },
                select: { id: true }
            })
        ]);

        return NextResponse.json({
            prevId: prev?.id || null,
            nextId: next?.id || null
        });
    } catch (error: any) {
        console.error('Error fetching tower navigation:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch navigation' },
            { status: 500 }
        );
    }
}
