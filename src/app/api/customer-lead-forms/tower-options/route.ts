import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

// Long Google-style addresses are unreadable in a dropdown, so keep the head.
const shorten = (v: string): string => (v.length > 78 ? `${v.slice(0, 75).trimEnd()}...` : v);

// GET /api/customer-lead-forms/tower-options?q=123&page=2 - Tower ID picker options (admin only)
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const page = Math.max(0, Number(searchParams.get('page') || '0') || 0);
  const PAGE_SIZE = 50;
  // Digits look for a tower id or a street number; text matches address, city, owner.
  const where: Prisma.TowerWhereInput = /^\d+$/.test(q)
    ? { OR: [{ id: Number(q) }, { parcel: { address: { contains: q, mode: 'insensitive' } } }] }
    : q
      ? {
          OR: [
            { businessName: { contains: q, mode: 'insensitive' } },
            { parcel: { address: { contains: q, mode: 'insensitive' } } },
            { parcel: { cityRaw: { contains: q, mode: 'insensitive' } } },
            { parcel: { owner: { name: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};
  // The args object is typed with satisfies: an inline orderBy literal drops
  // the select inference under this tsconfig, so keep it as one typed value.
  const args = {
    where,
    take: PAGE_SIZE + 1,
    skip: page * PAGE_SIZE,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      businessName: true,
      parcel: { select: { address: true, cityRaw: true, owner: { select: { name: true } } } },
    },
  } satisfies Prisma.TowerFindManyArgs;
  const towers = await prisma.tower.findMany(args);
  return NextResponse.json({
    hasMore: towers.length > PAGE_SIZE,
    data: towers.slice(0, PAGE_SIZE).map((t) => ({
      id: t.id,
      label: shorten([t.parcel?.address || t.businessName || 'No address', t.parcel?.cityRaw].filter(Boolean).join(', ')),
      owner: t.parcel?.owner?.name || null,
    })),
  });
}
