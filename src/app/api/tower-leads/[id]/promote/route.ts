import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

// POST /api/tower-leads/:id/promote - Promote a lead to a Tower
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await getAuthUser();

        const { id } = await params;
        const leadId = parseInt(id);

        // Parse body for optional streetViewUrl
        let body: { googleMapsUrl?: string } = {};
        try {
            body = await request.json();
        } catch {
            // No body is fine — googleMapsUrl is optional
        }

        if (isNaN(leadId)) {
            return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 });
        }

        // Find the lead
        const lead = await prisma.towerLead.findUnique({
            where: { id: leadId }
        });

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        if (lead.promotedToTowerId) {
            return NextResponse.json({ error: 'Lead already promoted' }, { status: 409 });
        }

        // Check if a tower already exists at these coordinates
        const existingTower = await prisma.tower.findUnique({
            where: {
                lat_lon: {
                    lat: lead.lat,
                    lon: lead.lon
                }
            }
        });

        if (existingTower) {
            // Link existing tower to the lead
            await prisma.towerLead.update({
                where: { id: leadId },
                data: {
                    promotedToTowerId: existingTower.id,
                    promotedAt: new Date()
                }
            });

            return NextResponse.json({
                tower: existingTower,
                message: 'Tower already exists at this location. Lead linked to existing tower.'
            });
        }

        // Create the tower and link the lead in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const tower = await tx.tower.create({
                data: {
                    lat: lead.lat,
                    lon: lead.lon,
                    status: {
                        connectOrCreate: {
                            where: { name: 'New' },
                            create: { name: 'New' }
                        }
                    },
                    legacyStatus: 'New',
                    source: `Tower Leads - ${lead.source}`,
                    googleMapsUrl: body.googleMapsUrl || null,
                }
            });

            await tx.towerLead.update({
                where: { id: leadId },
                data: {
                    promotedToTowerId: tower.id,
                    promotedAt: new Date()
                }
            });

            return tower;
        });

        return NextResponse.json({
            tower: result,
            message: 'Lead promoted to tower successfully.'
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error promoting tower lead:', error);
        return NextResponse.json({ error: 'Failed to promote tower lead' }, { status: 500 });
    }
}
