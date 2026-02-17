import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

import { PROVINCE_TO_ABBR, ABBR_TO_PROVINCE } from '@/lib/locations';

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

            // Normalize results: Convert abbreviations to full names and deduplicate
            const provinces = new Set<string>();
            result.forEach(r => {
                if (!r.province) return;
                // If it's an abbreviation like "AB", map to "Alberta". Otherwise keep as is.
                const fullName = ABBR_TO_PROVINCE[r.province] || r.province;
                provinces.add(fullName);
            });

            return NextResponse.json(Array.from(provinces).sort());
        }

        if (distinct === 'cities') {
            const where: any = {};
            if (country) where.country = { equals: country, mode: 'insensitive' };
            const province = searchParams.get('province');
            if (province) {
                // Determine abbreviations to search for both "Alberta" and "AB"
                const abbr = PROVINCE_TO_ABBR[province];
                const fullName = ABBR_TO_PROVINCE[province];
                const searchValues = [province];
                if (abbr) searchValues.push(abbr);
                if (fullName) searchValues.push(fullName);

                where.province = { in: searchValues, mode: 'insensitive' };
            }
            const result = await prisma.towerLead.findMany({
                where: { ...where, city: { not: null } },
                distinct: ['city'],
                select: { city: true },
                orderBy: { city: 'asc' }
            });
            return NextResponse.json(result.map(r => r.city).filter(Boolean));
        }

        if (distinct === 'sources') {
            const where: any = {};
            if (country) where.country = { equals: country, mode: 'insensitive' };
            const result = await prisma.towerLead.findMany({
                where: { ...where, source: { not: null } },
                distinct: ['source'],
                select: { source: true },
                orderBy: { source: 'asc' }
            });
            return NextResponse.json(result.map(r => r.source).filter(Boolean));
        }

        if (distinct === 'types') {
            const where: any = {};
            if (country) where.country = { equals: country, mode: 'insensitive' };
            const result = await prisma.towerLead.findMany({
                where: { ...where, type: { not: null } },
                distinct: ['type'],
                select: { type: true },
                orderBy: { type: 'asc' }
            });
            return NextResponse.json(result.map(r => r.type).filter(Boolean));
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
            where.city = { contains: city, mode: 'insensitive' };
        }
        if (source) {
            where.source = { contains: source, mode: 'insensitive' };
        }
        if (type) {
            where.type = { contains: type, mode: 'insensitive' };
        }

        const province = searchParams.get('province');
        if (province) {
            // Determine abbreviations to search for both "Alberta" and "AB"
            const abbr = PROVINCE_TO_ABBR[province];
            const fullName = ABBR_TO_PROVINCE[province];
            const searchValues = [province];
            if (abbr) searchValues.push(abbr); // If query is "Alberta", add "AB"
            if (fullName) searchValues.push(fullName); // If query is "AB", add "Alberta"

            // Deduplicate
            const uniqueSearchValues = Array.from(new Set(searchValues));

            where.province = { in: uniqueSearchValues, mode: 'insensitive' };
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
