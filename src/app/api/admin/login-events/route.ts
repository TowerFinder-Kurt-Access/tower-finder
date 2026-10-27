import { NextResponse } from 'next/server';
import { LoginEventType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';
import { withDbRetry } from '@/lib/db-retry';
import { resolveCountries } from '@/lib/ip-country';

const VALID_TYPES = new Set<string>(Object.values(LoginEventType));
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePage(value: string | null): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | null): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
    return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function buildWhere(searchParams: URLSearchParams): Prisma.LoginEventWhereInput {
    const where: Prisma.LoginEventWhereInput = {};

    const types = (searchParams.get('type') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => VALID_TYPES.has(value));

    if (types.length > 0) where.type = { in: types as LoginEventType[] };

    const email = searchParams.get('email')?.trim();
    if (email) where.email = { contains: email, mode: 'insensitive' };

    const ip = searchParams.get('ip')?.trim();
    if (ip) where.ip = { contains: ip };

    const userId = Number.parseInt(searchParams.get('userId') ?? '', 10);
    if (Number.isFinite(userId)) where.userId = userId;

    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'));
    if (from || to) {
        const createdAt: Prisma.DateTimeFilter = {};
        if (from) createdAt.gte = from;
        if (to) createdAt.lte = to;
        where.createdAt = createdAt;
    }

    return where;
}

/**
 * GET /api/admin/login-events — the full LoginEvent table for admins.
 * Filters: page, pageSize, type (comma separated), email, ip, userId, from, to.
 * `byType` counts every matching row, so the page can build its own summary.
 */
export async function GET(request: Request) {
    try {
        await requireAdmin();

        const { searchParams } = new URL(request.url);
        const page = parsePage(searchParams.get('page'));
        const pageSize = parsePageSize(searchParams.get('pageSize'));
        const where = buildWhere(searchParams);

        const [rows, total, grouped] = await withDbRetry(() =>
            Promise.all([
                prisma.loginEvent.findMany({
                    where,
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    select: {
                        id: true,
                        email: true,
                        userId: true,
                        type: true,
                        ip: true,
                        userAgent: true,
                        metadata: true,
                        createdAt: true,
                        user: { select: { id: true, name: true, email: true } },
                    },
                }),
                prisma.loginEvent.count({ where }),
                prisma.loginEvent.groupBy({ by: ['type'], where, _count: { _all: true } }),
            ])
        );

        const byType: Record<string, number> = {};
        for (const entry of grouped) byType[entry.type] = entry._count._all;

        // Country is resolved at read time, so the page gains a flag without a
        // schema change. A failed or unknown lookup leaves the field null.
        const countries = await resolveCountries(rows.map((row) => row.ip));
        const decorated = rows.map((row) => ({
            ...row,
            country: row.ip ? countries.get(row.ip) ?? null : null,
        }));

        return NextResponse.json({
            rows: decorated,
            total,
            page,
            pageSize,
            byType,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error instanceof Error && error.message.startsWith('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        console.error('Failed to fetch login events:', error);
        return NextResponse.json({ error: 'Failed to fetch login events' }, { status: 500 });
    }
}
