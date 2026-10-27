import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { LEAD_STAGE_LABELS } from '@/lib/leads';

export interface LeadStageOption {
    key: string;
    label: string;
    system: boolean;
}

function systemStages(overrides: { key: string; label: string | null; hidden: boolean }[]): LeadStageOption[] {
    const byKey = new Map(overrides.map((override) => [override.key, override]));
    return Object.entries(LEAD_STAGE_LABELS)
        .filter(([key]) => !byKey.get(key)?.hidden)
        .map(([key, label]) => ({ key, label: byKey.get(key)?.label ?? label, system: true }));
}

// GET /api/lead-stages - system tabs plus user-created tabs, in display order.
export async function GET() {
    try {
        await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [custom, overrides] = await Promise.all([
            prisma.leadCustomStage.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
            prisma.leadStageOverride.findMany(),
        ]);
        return NextResponse.json([
            ...systemStages(overrides),
            ...custom.map((stage) => ({ key: stage.key, label: stage.label, system: false })),
        ]);
    } catch (error) {
        console.error('Error fetching lead stages:', error);
        return NextResponse.json({ error: 'Failed to fetch stages' }, { status: 500 });
    }
}

// POST /api/lead-stages - Create a custom lead tab.
export async function POST(request: Request) {
    try {
        await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => null);
        const label = typeof body?.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
        if (!label) return NextResponse.json({ error: 'Stage name is required.' }, { status: 400 });
        if (label.length > 40) return NextResponse.json({ error: 'Stage name is too long.' }, { status: 400 });

        const existingLabel = await prisma.leadCustomStage.findFirst({
            where: { label: { equals: label, mode: 'insensitive' } },
        });
        if (existingLabel) {
            return NextResponse.json({ key: existingLabel.key, label: existingLabel.label, system: false });
        }

        const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'stage';
        let key = `custom_${base}`;
        const systemKeys = new Set(Object.keys(LEAD_STAGE_LABELS));
        let suffix = 2;
        while (systemKeys.has(key) || await prisma.leadCustomStage.findUnique({ where: { key }, select: { key: true } })) {
            key = `custom_${base}_${suffix}`;
            suffix += 1;
        }

        const highest = await prisma.leadCustomStage.aggregate({ _max: { sortOrder: true } });
        const stage = await prisma.leadCustomStage.create({
            data: { key, label, sortOrder: (highest._max.sortOrder ?? 0) + 1 },
        });

        return NextResponse.json({ key: stage.key, label: stage.label, system: false }, { status: 201 });
    } catch (error) {
        console.error('Error creating lead stage:', error);
        return NextResponse.json({ error: 'Failed to create stage' }, { status: 500 });
    }
}
