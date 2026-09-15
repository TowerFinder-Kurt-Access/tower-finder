import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';
import { toCustomerLeadFormData, validateCustomerLeadForm } from '@/lib/customer-lead-form';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const form = await prisma.customerLeadForm.findUnique({
    where: { id: parseInt(id) },
    include: { tower: { include: { parcel: { include: { owner: true } } } } },
  });
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(form);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof Error && e.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const err = validateCustomerLeadForm(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const data = toCustomerLeadFormData(body);
    if (body.larryCalledNow) {
      (data as Record<string, unknown>).larryCalledAt = new Date();
    }
    const updated = await prisma.customerLeadForm.update({
      where: { id: parseInt(id) },
      data: data as Record<string, never>,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating customer lead form:', error);
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}
