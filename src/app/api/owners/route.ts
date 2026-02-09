import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/owners - List all owners grouped by parcel
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const pageStr = searchParams.get('page');
        const limitStr = searchParams.get('limit');
        const distinct = searchParams.get('distinct');
        const city = searchParams.get('city');
        const county = searchParams.get('county');
        const state = searchParams.get('state');
        const zip = searchParams.get('zip');

        const page = pageStr ? parseInt(pageStr) : 0;
        const limit = limitStr ? parseInt(limitStr) : 25;
        const skip = page * limit;

        // Handle distinct values request for filters
        if (distinct === 'filters') {
            const [citiesResult, statesResult, countiesResult, zipsResult] = await Promise.all([
                prisma.$queryRaw<{ city: string }[]>`
                    SELECT DISTINCT p.city
                    FROM "Parcel" p
                    WHERE p.city IS NOT NULL AND p.city != ''
                    AND p."ownerId" IS NOT NULL
                    ORDER BY p.city
                `,
                prisma.$queryRaw<{ state: string }[]>`
                    SELECT DISTINCT p.state
                    FROM "Parcel" p
                    WHERE p.state IS NOT NULL AND p.state != ''
                    AND p."ownerId" IS NOT NULL
                    ORDER BY p.state
                `,
                prisma.$queryRaw<{ county: string }[]>`
                    SELECT DISTINCT p.county
                    FROM "Parcel" p
                    WHERE p.county IS NOT NULL AND p.county != ''
                    AND p."ownerId" IS NOT NULL
                    ORDER BY p.county
                `,
                prisma.$queryRaw<{ zip: string }[]>`
                    SELECT DISTINCT p.zip
                    FROM "Parcel" p
                    WHERE p.zip IS NOT NULL AND p.zip != ''
                    AND p."ownerId" IS NOT NULL
                    ORDER BY p.zip
                `
            ]);

            return NextResponse.json({
                cities: citiesResult.map(r => r.city),
                states: statesResult.map(r => r.state),
                counties: countiesResult.map(r => r.county),
                zips: zipsResult.map(r => r.zip)
            });
        }

        // Build where clause for filters
        const parcelFilters: any = {};
        if (city) parcelFilters.city = { equals: city, mode: 'insensitive' };
        if (county) parcelFilters.county = { equals: county, mode: 'insensitive' };
        if (state) parcelFilters.state = { equals: state, mode: 'insensitive' };
        if (zip) parcelFilters.zip = { equals: zip, mode: 'insensitive' };

        const whereClause: any = {
            parcel: {
                isNot: null,
                ...parcelFilters
            }
        };

        // Get all towers with owner information
        const towers = await prisma.tower.findMany({
            where: whereClause,
            include: {
                parcel: {
                    include: {
                        owner: true
                    }
                }
            }
        });

        // Group by Owner + Parcel ID client-side (complex SQL grouping would be difficult here)
        const ownerMap = new Map<string, any>();

        towers.forEach((tower: any) => {
            if (tower.parcel && tower.parcel.owner) {
                const ownerName = typeof tower.parcel.owner === 'string'
                    ? tower.parcel.owner
                    : tower.parcel.owner.name || 'Unknown';

                const parcelId = tower.parcel.parcelId || tower.parcel.parcel_id || 'Unknown';
                const address = tower.parcel.address || '';
                const city = tower.parcel.city || '';
                const county = tower.parcel.county || '';
                const state = tower.parcel.state || '';
                const zip = tower.parcel.zip || '';

                const key = `${ownerName}-${parcelId}`;

                if (ownerMap.has(key)) {
                    const existing = ownerMap.get(key);
                    existing.towerCount += 1;
                    existing.towerIds.push(tower.id);
                } else {
                    ownerMap.set(key, {
                        id: key,
                        ownerName,
                        parcelId,
                        address,
                        city,
                        county,
                        state,
                        zip,
                        towerCount: 1,
                        towerIds: [tower.id]
                    });
                }
            }
        });

        const allOwners = Array.from(ownerMap.values());
        const total = allOwners.length;

        // Apply pagination
        const paginatedOwners = allOwners.slice(skip, skip + limit);

        return NextResponse.json({
            data: paginatedOwners,
            total: total,
            page: page,
            limit: limit
        });
    } catch (error) {
        console.error('Error fetching owners:', error);
        return NextResponse.json({ error: 'Failed to fetch owners' }, { status: 500 });
    }
}
