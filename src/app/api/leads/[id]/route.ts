import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';
import { leadInclude, readLeadFields, toLeadRow } from '@/lib/lead-row';

// PATCH /api/leads/[id] - Update the editable fields of one lead.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    let user;
    try {
        user = await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const id = Number((await params).id);
        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json({ error: 'Invalid lead ID.' }, { status: 400 });
        }

        const existing = await prisma.lead.findUnique({ where: { id }, select: { towerId: true } });
        if (!existing) {
            return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
        }
        if (!(await canAccessTower(user.id, user.role, existing.towerId))) {
            return NextResponse.json({ error: 'You do not have access to that tower.' }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        const { data, error } = readLeadFields(body);
        if (error) return NextResponse.json({ error }, { status: 400 });
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
        }

        if (typeof data.towerId === 'number' && data.towerId !== existing.towerId) {
            const tower = await prisma.tower.findUnique({ where: { id: data.towerId }, select: { id: true } });
            if (!tower) {
                return NextResponse.json({ error: `Tower ${data.towerId} does not exist.` }, { status: 404 });
            }
            if (!(await canAccessTower(user.id, user.role, data.towerId))) {
                return NextResponse.json({ error: 'You do not have access to that tower.' }, { status: 403 });
            }
        }

        const lead = await prisma.lead.update({ where: { id }, data, include: leadInclude });
        return NextResponse.json(toLeadRow(lead));
    } catch (error) {
        console.error('Error updating lead:', error);
        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }
}
