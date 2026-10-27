import { NextResponse } from 'next/server';
import { LeadStage } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { LEAD_STAGE_LABELS } from '@/lib/leads';

interface RouteParams {
    params: Promise<{ key: string }>;
}

async function authorize() {
    try {
        await getAuthUser();
        return null;
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}

// PATCH /api/lead-stages/[key] - rename a custom stage.
export async function PATCH(request: Request, { params }: RouteParams) {
    const unauthorized = await authorize();
    if (unauthorized) return unauthorized;

    const { key } = await params;
    try {
        const body = await request.json().catch(() => null);
        const label = typeof body?.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
        if (!label) return NextResponse.json({ error: 'Stage name is required.' }, { status: 400 });
        if (label.length > 40) return NextResponse.json({ error: 'Stage name is too long.' }, { status: 400 });

        if (key in LEAD_STAGE_LABELS) {
            const override = await prisma.leadStageOverride.upsert({
                where: { key },
                update: { label, hidden: false },
                create: { key, label },
            });
            return NextResponse.json({ key, label: override.label, system: true });
        }

        const duplicate = await prisma.leadCustomStage.findFirst({
            where: { label: { equals: label, mode: 'insensitive' }, key: { not: key } },
            select: { key: true },
        });
        if (duplicate) return NextResponse.json({ error: 'Another stage already has that name.' }, { status: 409 });

        const stage = await prisma.leadCustomStage.update({ where: { key }, data: { label } });
        return NextResponse.json({ key: stage.key, label: stage.label, system: false });
    } catch (error) {
        console.error('Error renaming lead stage:', error);
        return NextResponse.json({ error: 'Failed to rename stage' }, { status: 500 });
    }
}

// DELETE /api/lead-stages/[key] - delete an unused custom stage.
export async function DELETE(_request: Request, { params }: RouteParams) {
    const unauthorized = await authorize();
    if (unauthorized) return unauthorized;

    const { key } = await params;
    try {
        if (key in LEAD_STAGE_LABELS) {
            const used = await prisma.lead.count({
                where: { stage: key as LeadStage, customStageKey: null },
            });
            if (used > 0) {
                return NextResponse.json(
                    { error: `Move ${used} lead${used === 1 ? '' : 's'} out of this stage before deleting it.` },
                    { status: 409 },
                );
            }
            await prisma.leadStageOverride.upsert({
                where: { key },
                update: { hidden: true },
                create: { key, hidden: true },
            });
            return NextResponse.json({ deleted: true });
        }

        const used = await prisma.lead.count({ where: { customStageKey: key } });
        if (used > 0) {
            return NextResponse.json(
                { error: `Move ${used} lead${used === 1 ? '' : 's'} out of this stage before deleting it.` },
                { status: 409 },
            );
        }

        await prisma.leadCustomStage.delete({ where: { key } });
        return NextResponse.json({ deleted: true });
    } catch (error) {
        console.error('Error deleting lead stage:', error);
        return NextResponse.json({ error: 'Failed to delete stage' }, { status: 500 });
    }
}
