import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';
import { toCustomerLeadFormData, validateCustomerLeadForm } from '@/lib/customer-lead-form';

// GET /api/customer-lead-forms - list forms (admin only)
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { owner: { contains: search, mode: 'insensitive' } },
        { fileId: { contains: search, mode: 'insensitive' } },
        { siteAddress: { contains: search, mode: 'insensitive' } },
      ];
    }
    const forms = await prisma.customerLeadForm.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { tower: { select: { id: true, lat: true, lon: true } } },
    });
    return NextResponse.json({ data: forms });
  } catch (error) {
    console.error('Error listing customer lead forms:', error);
    return NextResponse.json({ error: 'Failed to list forms' }, { status: 500 });
  }
}

// POST /api/customer-lead-forms - create form (admin only)
export async function POST(request: Request) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const err = validateCustomerLeadForm(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const data = toCustomerLeadFormData(body);
    if (body.larryCalledNow) {
      (data as Record<string, unknown>).larryCalledAt = new Date();
    }
    const created = await prisma.customerLeadForm.create({
      data: { ...(data as Record<string, never>), createdById: user.id },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating customer lead form:', error);
    return NextResponse.json({ error: 'Failed to create form' }, { status: 500 });
  }
}
