import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { LEASE_URGENT_DAYS } from '@/lib/lease-expiry';

// GET /api/lease-alerts - count of towers whose lease expiry is urgent
// (already expired or expiring within LEASE_URGENT_DAYS); drives the sidebar badge.
export async function GET() {
    try { await getAuthUser(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + LEASE_URGENT_DAYS);
        const count = await prisma.tower.count({
            where: { parcel: { leaseExpiry: { lte: cutoff } } }
        });
        return NextResponse.json({ count });
    } catch (error) {
        console.error('Error counting lease alerts:', error);
        return NextResponse.json({ error: 'Failed to count lease alerts' }, { status: 500 });
    }
}
