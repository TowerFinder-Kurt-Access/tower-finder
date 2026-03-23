import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ABBR_TO_PROVINCE } from '@/lib/locations';

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

            const statesSet = new Set<string>();
            statesResult.forEach(r => {
                const fullName = ABBR_TO_PROVINCE[r.state] || r.state;
                statesSet.add(fullName);
            });

            return NextResponse.json({
                cities: citiesResult.map(r => r.city),
                states: Array.from(statesSet).sort(),
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
                parcel: {
                    OR: [
                        { countyRaw: { in: countyValues, mode: 'insensitive' } },
                        { countyNormalized: { name: { in: countyValues, mode: 'insensitive' } } }
                    ]
                }
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

        // Build where clause for filters (on parcels of the owner)
        const parcelWhere: any = { ownerId: { not: null } };
        
        if (countryParam) {
            parcelWhere.country = { equals: countryParam, mode: 'insensitive' };
        }

        if (city) {
            const cityValues = city.split(',').filter(Boolean);
            parcelWhere.OR = [
                { cityRaw: { in: cityValues, mode: 'insensitive' } },
                { city: { name: { in: cityValues, mode: 'insensitive' } } }
            ];
        }

        if (county) {
            const countyValues = county.split(',').filter(Boolean);
            parcelWhere.countyRaw = { in: countyValues, mode: 'insensitive' };
        }

        if (state) {
            const stateValues = state.split(',').filter(Boolean);
            parcelWhere.OR = [
                ...(parcelWhere.OR || []),
                { stateRaw: { in: stateValues, mode: 'insensitive' } },
                { provinceRaw: { in: stateValues, mode: 'insensitive' } },
                { province: { name: { in: stateValues, mode: 'insensitive' } } },
                { province: { code: { in: stateValues, mode: 'insensitive' } } }
            ];
        }

        if (zip) {
            const zipValues = zip.split(',').filter(Boolean);
            parcelWhere.OR = [
                ...(parcelWhere.OR || []),
                { postalCode: { in: zipValues, mode: 'insensitive' } },
                { zip: { in: zipValues, mode: 'insensitive' } }
            ];
        }

        const ownersWhere: any = {
            parcels: {
                some: parcelWhere
            }
        };

        // Get owners with their parcels and towers
        const owners = await prisma.owner.findMany({
            where: ownersWhere,
            include: {
                contacts: true,
                parcels: {
                    where: parcelWhere,
                    include: {
                        tower: true,
                        city: true,
                        province: true,
                        countyNormalized: true
                    }
                }
            }
        });

        // Group by Owner + Parcel ID client-side
        const resultItems: any[] = [];

        owners.forEach((owner: any) => {
            // Each parcel for this owner becomes a row in the "Owners" table (as it's grouped by parcel)
            owner.parcels.forEach((parcel: any) => {
                if (!parcel.tower) return;

                const ownerName = owner.name || 'Unknown';
                const parcelId = parcel?.parcelId || 'Unknown';
                const address = parcel?.address || '';
                const cityVal = parcel?.city?.name || parcel?.cityRaw || '';
                const countyVal = parcel?.countyNormalized?.name || parcel?.countyRaw || '';
                const stateVal = parcel?.province?.name || parcel?.provinceRaw || parcel?.stateRaw || '';
                const zipVal = parcel?.postalCode || parcel?.zip || '';

                const key = `${ownerName}-${parcelId}`;
                
                const contacts = owner.contacts || [];
                const phones = contacts
                    .filter((c: any) => c.type === 'Phone')
                    .map((c: any) => c.value);
                const emails = contacts
                    .filter((c: any) => c.type === 'Email')
                    .map((c: any) => c.value);

                resultItems.push({
                    id: key,
                    ownerId: owner.id,
                    ownerName,
                    ownerType: owner.type || '',
                    ownerAddress: owner.address || '',
                    parcelId,
                    address,
                    city: cityVal,
                    county: countyVal,
                    state: stateVal,
                    zip: zipVal,
                    phones,
                    emails,
                    towerCount: 1, // With query on Owner -> Parcel, this is usually 1 tower per parcel in this schema
                    towerIds: [parcel.tower.id]
                });
            });
        });

        const total = resultItems.length;

        // Apply pagination
        const paginatedOwners = resultItems.slice(skip, skip + limit);

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
