import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/tower-leads - Fetch leads with pagination and filters
export async function GET(request: Request) {
    try {
        await getAuthUser();

        const { searchParams } = new URL(request.url);
        const distinct = searchParams.get('distinct');
        const country = searchParams.get('country');

        // Handle distinct queries for filter dropdowns
        if (distinct === 'provinces') {
            const where: any = {};
            if (country) where.country = { equals: country, mode: 'insensitive' };
            const result = await prisma.towerLead.findMany({
                where: { ...where, province: { not: null } },
                distinct: ['province'],
                select: { province: true },
                orderBy: { province: 'asc' }
            });
            return NextResponse.json(result.map(r => r.province).filter(Boolean));
        }

        if (distinct === 'cities') {
            const where: any = {};
            if (country) where.country = { equals: country, mode: 'insensitive' };
            const province = searchParams.get('province');
            if (province) where.province = { equals: province, mode: 'insensitive' };
            const result = await prisma.towerLead.findMany({
                where: { ...where, city: { not: null } },
                distinct: ['city'],
                select: { city: true },
                orderBy: { city: 'asc' }
            });
            return NextResponse.json(result.map(r => r.city).filter(Boolean));
        }

        const page = parseInt(searchParams.get('page') || '0');
        const limit = parseInt(searchParams.get('limit') || '25');
        const city = searchParams.get('city');
        const source = searchParams.get('source');
        const type = searchParams.get('type');

        // Build where clause
        const where: any = {};

        if (country) {
            where.country = { equals: country, mode: 'insensitive' };
        }
        if (city) {
            where.city = { equals: city, mode: 'insensitive' };
        }
        if (source) {
            where.source = { equals: source, mode: 'insensitive' };
        }
        if (type) {
            where.type = { equals: type, mode: 'insensitive' };
        }

        const province = searchParams.get('province');
        if (province) {
            where.province = { equals: province, mode: 'insensitive' };
        }

        const promoted = searchParams.get('promoted');
        if (promoted === 'true') {
            where.promotedToTowerId = { not: null };
        } else if (promoted === 'false') {
            where.promotedToTowerId = null;
        }

        const [leads, totalCount] = await Promise.all([
            prisma.towerLead.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: page * limit,
                take: limit,
            }),
            prisma.towerLead.count({ where }),
        ]);

        return NextResponse.json({
            data: leads,
            totalCount,
            page,
            limit,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching tower leads:', error);
        return NextResponse.json({ error: 'Failed to fetch tower leads' }, { status: 500 });
    }
}
