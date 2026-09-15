import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/customer-lead-forms/prefill?towerId=123 - dashboard-filled fields
export async function GET(request: Request) {
  try {
    await getAuthUser();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const towerId = parseInt(searchParams.get('towerId') || '');
  if (!towerId) return NextResponse.json({ error: 'towerId required' }, { status: 400 });
  const tower = await prisma.tower.findUnique({
    where: { id: towerId },
    include: {
      parcel: { include: { owner: { include: { contacts: true } }, city: true, province: true } },
      carrier: true,
      type: true,
    },
  });
  if (!tower) return NextResponse.json({ error: 'Tower not found' }, { status: 404 });
  const ownerName = tower.parcel?.owner?.name || '';
  const contacts = tower.parcel?.owner?.contacts || [];
  const phone = contacts.find((c) => c.type === 'phone')?.value || '';
  const email = contacts.find((c) => c.type === 'email')?.value || '';
  const contact = contacts.find((c) => c.type !== 'phone' && c.type !== 'email')?.value || '';
  const mailing = tower.parcel?.owner?.address || '';
  const site = tower.parcel?.address || '';
  return NextResponse.json({
    towerId: tower.id,
    owner: ownerName,
    phone,
    contact,
    email,
    mailingAddress: mailing,
    siteAddress: site,
    source: tower.source || '',
  });
}
