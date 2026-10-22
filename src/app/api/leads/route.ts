import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LeadStage, Prisma, Role } from '@prisma/client';
import { getAuthUser } from '@/lib/auth-helpers';
import { resolveContact } from '@/lib/leads';

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
            .filter((value): value is LeadStage => value in LeadStage);
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

        const where: Prisma.LeadWhereInput = stage.length ? { AND: [baseWhere, { stage: { in: stage } }] } : baseWhere;

        const sortable: Record<string, Prisma.LeadOrderByWithRelationInput> = {
            stage: { stage: order },
            towerId: { towerId: order },
            contactPerson: { contactPerson: order },
            companyName: { companyName: order },
        };
        const orderBy: Prisma.LeadOrderByWithRelationInput[] = [sortable[sort] ?? { stage: 'asc' }, { id: 'asc' }];

        const [rows, total, counts] = await Promise.all([
            prisma.lead.findMany({
                where,
                orderBy,
                skip: page * limit,
                take: limit,
                include: {
                    tower: {
                        include: {
                            parcel: { include: { owner: { include: { contacts: true } } } },
                        },
                    },
                },
            }),
            prisma.lead.count({ where }),
            prisma.lead.groupBy({ by: ['stage'], where: baseWhere, _count: { _all: true } }),
        ]);

        const data = rows.map((lead) => {
            const parcel = lead.tower.parcel;
            const owner = parcel?.owner;
            const contacts = resolveContact(lead, owner);
            const phone = owner?.contacts.find((contact) => contact.type.toLowerCase() === 'phone');

            return {
                id: lead.id,
                stage: lead.stage,
                contactPerson: contacts.contactPerson,
                companyName: contacts.companyName,
                actions: lead.actions,
                remarks: lead.remarks,
                brettStatus: lead.brettStatus,
                emailFollowUp: lead.emailFollowUp,
                towerId: lead.towerId,
                address: parcel?.address ?? null,
                city: parcel?.cityRaw ?? null,
                state: parcel?.stateRaw ?? parcel?.provinceRaw ?? null,
                ownerName: owner?.name ?? null,
                ownerType: owner?.type ?? null,
                ownerPhone: phone?.value?.trim() ?? null,
            };
        });

        return NextResponse.json({
            data,
            total,
            page,
            limit,
            counts: Object.fromEntries(counts.map((group) => [group.stage, group._count._all])),
        });
    } catch (error) {
        console.error('Error fetching leads:', error);
        return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }
}
