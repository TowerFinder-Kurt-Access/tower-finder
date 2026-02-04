import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/owners - List all owners grouped by parcel
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const pageStr = searchParams.get('page');
        const limitStr = searchParams.get('limit');

        const page = pageStr ? parseInt(pageStr) : 0;
        const limit = limitStr ? parseInt(limitStr) : 25;
        const skip = page * limit;

        // Get all towers with owner information
        const towers = await prisma.tower.findMany({
            where: {
                parcel: {
                    isNot: null
                }
            },
            include: {
                parcel: {
                    include: {
                        owner: true
                    }
                }
            }
        });

        // Group by Owner + Parcel ID client-side (complex SQL grouping would be difficult here)
        const ownerMap = new Map<string, any>();

        towers.forEach((tower: any) => {
            if (tower.parcel && tower.parcel.owner) {
                const ownerName = typeof tower.parcel.owner === 'string'
                    ? tower.parcel.owner
                    : tower.parcel.owner.name || 'Unknown';

                const parcelId = tower.parcel.parcelId || tower.parcel.parcel_id || 'Unknown';
                const address = tower.parcel.address || 'Unknown';

                const key = `${ownerName}-${parcelId}`;

                if (ownerMap.has(key)) {
                    const existing = ownerMap.get(key);
                    existing.towerCount += 1;
                    existing.towerIds.push(tower.id);
                } else {
                    ownerMap.set(key, {
                        id: key,
                        ownerName,
                        parcelId,
                        address,
                        towerCount: 1,
                        towerIds: [tower.id]
                    });
                }
            }
        });

        const allOwners = Array.from(ownerMap.values());
        const total = allOwners.length;

        // Apply pagination
        const paginatedOwners = allOwners.slice(skip, skip + limit);

        return NextResponse.json({
            data: paginatedOwners,
            total: total,
            page: page,
            limit: limit
        });
    } catch (error) {
        console.error('Error fetching owners:', error);
        return NextResponse.json({ error: 'Failed to fetch owners' }, { status: 500 });
    }
}
