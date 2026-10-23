import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/towers/options?q= - Lightweight tower lookup for the lead picker.
export async function GET(request: Request) {
    let user;
    try {
        user = await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const query = (searchParams.get('q') || '').trim();
        if (query.length === 0) return NextResponse.json([]);

        const access = user.role === Role.ADMIN ? {} : { assignments: { some: { userId: user.id } } };
        const numeric = /^\d+$/.test(query);

        const towers = await prisma.tower.findMany({
            where: {
                AND: [
                    access,
                    numeric
                        ? {
                            OR: [
                                { id: Number(query) },
                                { parcel: { address: { contains: query, mode: 'insensitive' } } },
                            ],
                        }
                        : {
                            parcel: {
                                OR: [
                                    { address: { contains: query, mode: 'insensitive' } },
                                    { cityRaw: { contains: query, mode: 'insensitive' } },
                                    { city: { name: { contains: query, mode: 'insensitive' } } },
                                ],
                            },
                        },
                ],
            },
            select: {
                id: true,
                type: { select: { name: true } },
                parcel: {
                    select: {
                        address: true,
                        cityRaw: true,
                        city: { select: { name: true } },
                        stateRaw: true,
                        provinceRaw: true,
                        province: { select: { name: true } },
                        owner: { select: { name: true, type: true } },
                    },
                },
            },
            orderBy: { id: 'asc' },
            take: 10,
        });

        return NextResponse.json(towers.map((tower) => ({
            id: tower.id,
            address: tower.parcel?.address ?? null,
            city: tower.parcel?.city?.name ?? tower.parcel?.cityRaw ?? null,
            state: tower.parcel?.province?.name ?? tower.parcel?.stateRaw ?? tower.parcel?.provinceRaw ?? null,
            type: tower.type?.name ?? null,
            ownerName: tower.parcel?.owner?.name ?? null,
            ownerType: tower.parcel?.owner?.type ?? null,
        })));
    } catch (error) {
        console.error('Error searching towers:', error);
        return NextResponse.json({ error: 'Failed to search towers' }, { status: 500 });
    }
}
