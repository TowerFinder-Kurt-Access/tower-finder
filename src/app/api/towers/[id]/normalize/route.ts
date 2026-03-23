import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LocationNormalizationService } from '@/services/LocationNormalizationService';
import { getAuthUser } from '@/lib/auth-helpers';

/**
 * POST /api/towers/[id]/normalize
 * 
 * Manually trigger location normalization for a specific tower's parcel.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const towerId = parseInt(id);

        const tower = await prisma.tower.findUnique({
            where: { id: towerId },
            include: { parcel: true }
        });

        if (!tower || !tower.parcel) {
            return NextResponse.json({ error: 'Tower or parcel not found' }, { status: 404 });
        }

        const result = await LocationNormalizationService.normalizeParcel(tower.parcel.id);

        return NextResponse.json({
            message: 'Normalization completed',
            result
        });
    } catch (error: any) {
        console.error('Manual normalization failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
