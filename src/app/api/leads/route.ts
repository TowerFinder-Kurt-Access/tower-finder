import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LeadStage, Prisma, Role } from '@prisma/client';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';
import { leadInclude, readLeadFields, toLeadRow } from '@/lib/lead-row';

// GET /api/leads - Paginated outreach leads, joined to their tower and property owner.
export async function GET(request: Request) {
    let user;
    try {
        user = await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const stage = (searchParams.get('stage') || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const search = (searchParams.get('search') || '').trim();
        const page = Math.max(parseInt(searchParams.get('page') || '0', 10) || 0, 0);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10) || 100, 1), 500);
        const sort = searchParams.get('sort') || 'stage';
        const order = (searchParams.get('order') === 'desc' ? 'desc' : 'asc') as Prisma.SortOrder;

        // Search and access apply to every tab, so the tab counts stay meaningful.
        const baseWhere: Prisma.LeadWhereInput = {
            AND: [
                search
                    ? {
                        OR: [
                            { contactPerson: { contains: search, mode: 'insensitive' } },
                            { companyName: { contains: search, mode: 'insensitive' } },
                            { remarks: { contains: search, mode: 'insensitive' } },
                            { actions: { contains: search, mode: 'insensitive' } },
                        ],
                    }
                    : {},
                user.role === Role.ADMIN
                    ? {}
                    : { tower: { assignments: { some: { userId: user.id } } } },
            ],
        };

        const stageFilters: Prisma.LeadWhereInput[] = stage.map((key) =>
            key in LeadStage
                ? { stage: key as LeadStage, customStageKey: null }
                : { customStageKey: key }
        );
        const where: Prisma.LeadWhereInput = stageFilters.length
            ? { AND: [baseWhere, { OR: stageFilters }] }
            : baseWhere;

        const sortable: Record<string, Prisma.LeadOrderByWithRelationInput> = {
            stage: { stage: order },
            towerId: { towerId: order },
            contactPerson: { contactPerson: order },
            companyName: { companyName: order },
        };
        const orderBy: Prisma.LeadOrderByWithRelationInput[] = [sortable[sort] ?? { stage: 'asc' }, { id: 'asc' }];

        const [rows, total, systemCounts, customCounts] = await Promise.all([
            prisma.lead.findMany({
                where,
                orderBy,
                skip: page * limit,
                take: limit,
                include: leadInclude,
            }),
            prisma.lead.count({ where }),
            prisma.lead.groupBy({
                by: ['stage'],
                where: { AND: [baseWhere, { customStageKey: null }] },
                _count: { _all: true },
            }),
            prisma.lead.groupBy({
                by: ['customStageKey'],
                where: { AND: [baseWhere, { customStageKey: { not: null } }] },
                _count: { _all: true },
            }),
        ]);

        return NextResponse.json({
            data: rows.map(toLeadRow),
            total,
            page,
            limit,
            counts: Object.fromEntries([
                ...systemCounts.map((group) => [group.stage, group._count._all]),
                ...customCounts.map((group) => [group.customStageKey as string, group._count._all]),
            ]),
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }
}

// POST /api/leads - Create a lead for an existing tower.
export async function POST(request: Request) {
    let user;
    try {
        user = await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => null);
        const towerId = Number((body as { towerId?: unknown } | null)?.towerId);
        if (!Number.isInteger(towerId) || towerId <= 0) {
            return NextResponse.json({ error: 'Enter a numeric tower ID.' }, { status: 400 });
        }

        const tower = await prisma.tower.findUnique({ where: { id: towerId }, select: { id: true } });
        if (!tower) {
            return NextResponse.json({ error: `Tower ${towerId} does not exist.` }, { status: 404 });
        }
        if (!(await canAccessTower(user.id, user.role, towerId))) {
            return NextResponse.json({ error: 'You do not have access to that tower.' }, { status: 403 });
        }

        const { data, error } = readLeadFields(body);
        if (error) return NextResponse.json({ error }, { status: 400 });
        if (!data.stage) return NextResponse.json({ error: 'Choose a stage.' }, { status: 400 });
        const customStageKey = typeof data.customStageKey === 'string' ? data.customStageKey : null;
        if (customStageKey) {
            const exists = await prisma.leadCustomStage.findUnique({
                where: { key: customStageKey },
                select: { key: true },
            });
            if (!exists) return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 });
        }

        const highest = await prisma.lead.aggregate({ _max: { sortOrder: true } });
        const lead = await prisma.lead.create({
            data: {
                ...(data as Prisma.LeadUncheckedCreateInput),
                towerId,
                sortOrder: (highest._max.sortOrder ?? 0) + 1,
            },
            include: leadInclude,
        });

        return NextResponse.json(toLeadRow(lead), { status: 201 });
    } catch (error) {
        console.error('Error creating lead:', error);
        return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }
}
