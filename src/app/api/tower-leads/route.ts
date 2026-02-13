import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/tower-leads?province=BC - Fetch leads for a province
export async function GET(request: Request) {
    try {
        await getAuthUser();

        const { searchParams } = new URL(request.url);
        const province = searchParams.get('province');

        if (!province) {
            return NextResponse.json({ error: 'Province parameter is required' }, { status: 400 });
        }

        const leads = await prisma.towerLead.findMany({
            where: {
                province: { equals: province, mode: 'insensitive' },
                promotedToTowerId: null // Only show non-promoted leads
            },
            orderBy: { id: 'asc' }
        });

        return NextResponse.json(leads);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching tower leads:', error);
        return NextResponse.json({ error: 'Failed to fetch tower leads' }, { status: 500 });
    }
}
