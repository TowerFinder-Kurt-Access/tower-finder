import { NextResponse } from 'next/server';
import { LoginEventType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';
import { withDbRetry } from '@/lib/db-retry';
import { resolveCountries } from '@/lib/ip-country';
import { createTtlCache } from '@/lib/ttl-cache';

const VALID_TYPES = new Set<string>(Object.values(LoginEventType));
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Paging and filter toggles repeat the same reads, so a short cache keeps them
// off the database. Refresh sends fresh=1 and always reads the current table.
const CACHE_TTL_MS = 5_000;

interface LoginEventRow {
    id: number;
    email: string;
    userId: number | null;
    type: LoginEventType;
    ip: string | null;
    userAgent: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    user: { id: number; name: string; email: string } | null;
    country: string | null;
}

interface LoginEventSummary {
    total: number;
    byType: Record<string, number>;
}

const listCache = createTtlCache<LoginEventRow[]>(CACHE_TTL_MS);
const summaryCache = createTtlCache<LoginEventSummary>(CACHE_TTL_MS);

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

interface BuiltQuery {
    where: Prisma.LoginEventWhereInput;
    /** Stable key for the caches. Two requests with the same filters match. */
    signature: string;
}

function buildQuery(searchParams: URLSearchParams): BuiltQuery {
    const where: Prisma.LoginEventWhereInput = {};
    const parts: string[] = [];

    const types = (searchParams.get('type') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => VALID_TYPES.has(value));

    if (types.length > 0) {
        where.type = { in: types as LoginEventType[] };
        // Sorted so toggle order does not split the cache.
        parts.push(`type=${[...types].sort((a, b) => a.localeCompare(b)).join(',')}`);
    }

    const email = searchParams.get('email')?.trim();
    if (email) {
        where.email = { contains: email, mode: 'insensitive' };
        parts.push(`email=${email.toLowerCase()}`);
    }

    const ip = searchParams.get('ip')?.trim();
    if (ip) {
        where.ip = { contains: ip };
        parts.push(`ip=${ip}`);
    }

    const userId = Number.parseInt(searchParams.get('userId') ?? '', 10);
    if (Number.isFinite(userId)) {
        where.userId = userId;
        parts.push(`userId=${userId}`);
    }

    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'));
    if (from || to) {
        const createdAt: Prisma.DateTimeFilter = {};
        if (from) {
            createdAt.gte = from;
            parts.push(`from=${from.toISOString()}`);
        }
        if (to) {
            createdAt.lte = to;
            parts.push(`to=${to.toISOString()}`);
        }
        where.createdAt = createdAt;
    }

    return { where, signature: parts.join('&') || 'all' };
}

async function fetchSummary(where: Prisma.LoginEventWhereInput): Promise<LoginEventSummary> {
    const [total, grouped] = await withDbRetry(() =>
        Promise.all([
            prisma.loginEvent.count({ where }),
            prisma.loginEvent.groupBy({ by: ['type'], where, _count: { _all: true } }),
        ])
    );

    const byType: Record<string, number> = {};
    for (const entry of grouped) byType[entry.type] = entry._count._all;

    return { total, byType };
}

async function fetchRows(
    where: Prisma.LoginEventWhereInput,
    page: number,
    pageSize: number
): Promise<LoginEventRow[]> {
    const rows = await withDbRetry(() =>
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
        })
    );

    // Country is resolved at read time, so the page gains a flag without a
    // schema change. A failed or unknown lookup leaves the field null.
    const countries = await resolveCountries(rows.map((row) => row.ip));

    return rows.map((row) => ({
        ...row,
        country: row.ip ? countries.get(row.ip) ?? null : null,
    }));
}

/**
 * GET /api/admin/login-events — the full LoginEvent table for admins.
 * Filters: page, pageSize, type (comma separated), email, ip, userId, from, to.
 * Pass fresh=1 to bypass the short cache. `byType` counts every matching row.
 */
export async function GET(request: Request) {
    try {
        await requireAdmin();

        const { searchParams } = new URL(request.url);
        const page = parsePage(searchParams.get('page'));
        const pageSize = parsePageSize(searchParams.get('pageSize'));
        const fresh = searchParams.get('fresh') === '1';
        const { where, signature } = buildQuery(searchParams);

        const listKey = `${signature}|${page}|${pageSize}`;
        const cachedRows = fresh ? null : listCache.get(listKey);
        const cachedSummary = fresh ? null : summaryCache.get(signature);

        const [fetchedRows, fetchedSummary] = await Promise.all([
            cachedRows ? Promise.resolve(null) : fetchRows(where, page, pageSize),
            cachedSummary ? Promise.resolve(null) : fetchSummary(where),
        ]);

        const rows = fetchedRows ?? cachedRows ?? [];
        if (fetchedRows) listCache.set(listKey, fetchedRows);

        const summary = fetchedSummary ?? cachedSummary ?? { total: 0, byType: {} };
        if (fetchedSummary) summaryCache.set(signature, fetchedSummary);

        return NextResponse.json({
            rows,
            total: summary.total,
            page,
            pageSize,
            byType: summary.byType,
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
