import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

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
            const countryParam = searchParams.get('country');
            const countryFilter = countryParam ? Prisma.sql`AND p.country = ${countryParam}` : Prisma.sql``;

            const [citiesResult, statesResult, countiesResult, zipsResult] = await Promise.all([
                prisma.$queryRaw<{ city: string }[]>`
                    SELECT DISTINCT name as city FROM (
                        SELECT c."name" FROM "City" c
                        JOIN "Parcel" p ON p."cityId" = c.id
                        WHERE p."ownerId" IS NOT NULL ${countryFilter}
                        UNION
                        SELECT p."cityRaw" as name FROM "Parcel" p
                        WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" != ''
                        AND p."ownerId" IS NOT NULL ${countryFilter}
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
                `,
                prisma.$queryRaw<{ state: string }[]>`
                    SELECT DISTINCT name as state FROM (
                        SELECT pr."name" FROM "Province" pr
                        JOIN "Parcel" p ON p."provinceId" = pr.id
                        WHERE p."ownerId" IS NOT NULL ${countryFilter}
                        UNION
                        SELECT p."stateRaw" as name FROM "Parcel" p
                        WHERE p."stateRaw" IS NOT NULL AND p."stateRaw" != ''
                        AND p."ownerId" IS NOT NULL ${countryFilter}
                        UNION
                        SELECT p."provinceRaw" as name FROM "Parcel" p
                        WHERE p."provinceRaw" IS NOT NULL AND p."provinceRaw" != ''
                        AND p."ownerId" IS NOT NULL ${countryFilter}
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
                `,
                prisma.$queryRaw<{ county: string }[]>`
                    SELECT DISTINCT p.county
                    FROM "Parcel" p
                    WHERE p.county IS NOT NULL AND p.county != ''
                    AND p."ownerId" IS NOT NULL ${countryFilter}
                    ORDER BY p.county
                `,
                prisma.$queryRaw<{ zip: string }[]>`
                    SELECT DISTINCT name as zip FROM (
                        SELECT p."postalCode" as name FROM "Parcel" p
                        WHERE p."postalCode" IS NOT NULL AND p."postalCode" != ''
                        AND p."ownerId" IS NOT NULL ${countryFilter}
                        UNION
                        SELECT p.zip as name FROM "Parcel" p
                        WHERE p.zip IS NOT NULL AND p.zip != ''
                        AND p."ownerId" IS NOT NULL ${countryFilter}
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
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
        const countryParam = searchParams.get('country');
        const andConditions: any[] = [];

        if (countryParam) {
            andConditions.push({
                parcel: { country: { equals: countryParam, mode: 'insensitive' } }
            });
        }

        if (city) {
            const cityValues = city.split(',').filter(Boolean);
            andConditions.push({
                parcel: {
                    OR: [
                        { cityRaw: { in: cityValues, mode: 'insensitive' } },
                        { city: { name: { in: cityValues, mode: 'insensitive' } } }
                    ]
                }
            });
        }

        if (county) {
            const countyValues = county.split(',').filter(Boolean);
            andConditions.push({
                parcel: { county: { in: countyValues, mode: 'insensitive' } }
            });
        }

        if (state) {
            const stateValues = state.split(',').filter(Boolean);
            andConditions.push({
                OR: [
                    { parcel: { stateRaw: { in: stateValues, mode: 'insensitive' } } },
                    { parcel: { provinceRaw: { in: stateValues, mode: 'insensitive' } } },
                    { parcel: { province: { name: { in: stateValues, mode: 'insensitive' } } } },
                    { parcel: { province: { code: { in: stateValues, mode: 'insensitive' } } } }
                ]
            });
        }

        if (zip) {
            const zipValues = zip.split(',').filter(Boolean);
            andConditions.push({
                parcel: {
                    OR: [
                        { postalCode: { in: zipValues, mode: 'insensitive' } },
                        { zip: { in: zipValues, mode: 'insensitive' } }
                    ]
                }
            });
        }

        const whereClause: any = {
            parcel: { isNot: null },
            ...(andConditions.length > 0 ? { AND: andConditions } : {})
        };

        // Get all towers with owner information
        const towers = await prisma.tower.findMany({
            where: whereClause,
            include: {
                parcel: {
                    include: {
                        owner: {
                            include: { contacts: true }
                        },
                        city: true,
                        province: true
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

                const parcelId = tower.parcel.parcelId || 'Unknown';
                const address = tower.parcel.address || '';
                const cityVal = typeof tower.parcel.city === 'object' && tower.parcel.city
                    ? (tower.parcel.city as any).name
                    : (tower.parcel.cityRaw || '');
                const county = tower.parcel.county || '';
                const stateVal = typeof tower.parcel.province === 'object' && tower.parcel.province
                    ? (tower.parcel.province as any).name
                    : (tower.parcel.provinceRaw || tower.parcel.stateRaw || '');
                const zip = tower.parcel.postalCode || tower.parcel.zip || '';

                const key = `${ownerName}-${parcelId}`;

                if (ownerMap.has(key)) {
                    const existing = ownerMap.get(key);
                    existing.towerCount += 1;
                    existing.towerIds.push(tower.id);
                } else {
                    const ownerObj = tower.parcel.owner as any;
                    const contacts = ownerObj?.contacts || [];
                    const phones = contacts
                        .filter((c: any) => c.type === 'Phone')
                        .map((c: any) => c.value);
                    const emails = contacts
                        .filter((c: any) => c.type === 'Email')
                        .map((c: any) => c.value);

                    ownerMap.set(key, {
                        id: key,
                        ownerId: ownerObj?.id || null,
                        ownerName,
                        ownerType: ownerObj?.type || '',
                        ownerAddress: ownerObj?.address || '',
                        parcelId,
                        address,
                        city: cityVal,
                        county,
                        state: stateVal,
                        zip,
                        phones,
                        emails,
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

// POST /api/owners - Create a new owner with optional contacts and link to a tower's parcel
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, type, address, contacts, towerId } = body;

        if (!name) {
            return NextResponse.json({ error: 'Owner name is required' }, { status: 400 });
        }

        const owner = await prisma.owner.create({
            data: {
                name,
                type: type || null,
                address: address || null,
                contacts: contacts && contacts.length > 0 ? {
                    create: contacts.map((c: { type: string; value: string; label?: string }) => ({
                        type: c.type,
                        value: c.value,
                        label: c.label || null
                    }))
                } : undefined
            },
            include: { contacts: true }
        });

        // If towerId provided, link owner to the tower's parcel
        if (towerId) {
            await prisma.parcel.updateMany({
                where: { towerId: parseInt(towerId) },
                data: { ownerId: owner.id }
            });
        }

        return NextResponse.json(owner, { status: 201 });
    } catch (error) {
        console.error('Error creating owner:', error);
        return NextResponse.json({ error: 'Failed to create owner' }, { status: 500 });
    }
}
