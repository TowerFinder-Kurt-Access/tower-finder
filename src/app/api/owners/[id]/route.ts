import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/owners/:id - Get owner detail with contacts and associated towers
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const ownerId = parseInt(id);

        if (isNaN(ownerId)) {
            return NextResponse.json({ error: 'Invalid owner ID' }, { status: 400 });
        }

        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: {
                contacts: true,
                parcels: {
                    include: {
                        tower: {
                            include: {
                                type: true,
                                licensee: true,
                                status: true,
                                _count: { select: { notes: true } }
                            }
                        },
                        city: true,
                        province: true
                    }
                }
            }
        });

        if (!owner) {
            return NextResponse.json({ error: 'Owner not found' }, { status: 404 });
        }

        // Format towers from parcels
        const towers = owner.parcels
            .filter(p => p.tower)
            .map(p => ({
                id: p.tower.id,
                lat: p.tower.lat,
                lon: p.tower.lon,
                type: p.tower.type?.name || '',
                licensee: p.tower.licensee?.name || '',
                status: p.tower.status?.name || p.tower.legacyStatus || 'Unknown',
                source: p.tower.source,
                address: p.address || '',
                city: typeof p.city === 'object' && p.city ? p.city.name : (p.cityRaw || ''),
                state: typeof p.province === 'object' && p.province ? p.province.name : (p.provinceRaw || p.stateRaw || ''),
                notesCount: p.tower._count?.notes || 0
            }));

        return NextResponse.json({
            ...owner,
            towers
        });
    } catch (error) {
        console.error('Error fetching owner:', error);
        return NextResponse.json({ error: 'Failed to fetch owner' }, { status: 500 });
    }
}

// PATCH /api/owners/:id - Update owner and contacts
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const ownerId = parseInt(id);
        const body = await request.json();

        if (isNaN(ownerId)) {
            return NextResponse.json({ error: 'Invalid owner ID' }, { status: 400 });
        }

        const { name, type, address, contacts } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (address !== undefined) updateData.address = address;

        const owner = await prisma.owner.update({
            where: { id: ownerId },
            data: updateData,
            include: { contacts: true }
        });

        // If contacts array provided, sync them
        if (contacts !== undefined) {
            // Delete existing contacts and recreate
            await prisma.contact.deleteMany({ where: { ownerId } });
            if (contacts.length > 0) {
                await prisma.contact.createMany({
                    data: contacts.map((c: any) => ({
                        ownerId,
                        type: c.type,
                        value: c.value,
                        label: c.label || null,
                        isValid: c.isValid !== undefined ? c.isValid : true
                    }))
                });
            }
        }

        // Re-fetch with contacts
        const updated = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { contacts: true }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating owner:', error);
        return NextResponse.json({ error: 'Failed to update owner' }, { status: 500 });
    }
}
