import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ABBR_TO_PROVINCE } from '@/lib/locations';
import { dedupeDisplayValues } from '@/lib/normalize';
import { filterOfficialCanadianCities, filterOfficialCanadianCounties, filterCanadianPostalCodes, isCanada } from '@/lib/official-cities';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/owners - List all owners grouped by parcel
export async function GET(request: Request) {
    try { await getAuthUser(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    try {
        const { searchParams } = new URL(request.url);
        const pageStr = searchParams.get('page');
        const limitStr = searchParams.get('limit');
        const distinct = searchParams.get('distinct');
        const city = searchParams.get('city');
        const county = searchParams.get('county');
        const state = searchParams.get('state');
        const zip = searchParams.get('zip');

        const page = pageStr ? parseInt(pageStr, 10) : 0;
        const limit = limitStr ? parseInt(limitStr, 10) : 25;
        const skip = page * limit;

        // Handle distinct values request for filters
        if (distinct === 'filters') {
            const countryParam = searchParams.get('country');
            const countryFilter = countryParam ? Prisma.sql`AND p.country = ${countryParam}` : Prisma.sql``;

            // One round trip: a single row per facet, each with its sorted values.
            const facetRows = await prisma.$queryRaw<{ facet: string; values: string[] }[]>(Prisma.sql`
                SELECT facet, array_agg(DISTINCT value ORDER BY value) AS values
                FROM (
                    ${Prisma.join([
                        Prisma.sql`SELECT 'cities'::text AS facet, c."name" AS value FROM "City" c
                                JOIN "Parcel" p ON p."cityId" = c.id
                                WHERE p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'cities' AS facet, p."cityRaw" AS value FROM "Parcel" p
                                WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" <> ''
                                AND p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'states' AS facet, pr."name" AS value FROM "Province" pr
                                JOIN "Parcel" p ON p."provinceId" = pr.id
                                WHERE p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'states' AS facet, p."stateRaw" AS value FROM "Parcel" p
                                WHERE p."stateRaw" IS NOT NULL AND p."stateRaw" <> ''
                                AND p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'states' AS facet, p."provinceRaw" AS value FROM "Parcel" p
                                WHERE p."provinceRaw" IS NOT NULL AND p."provinceRaw" <> ''
                                AND p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'counties' AS facet, p."county" AS value FROM "Parcel" p
                                WHERE p."county" IS NOT NULL AND p."county" <> ''
                                AND p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'zips' AS facet, p."postalCode" AS value FROM "Parcel" p
                                WHERE p."postalCode" IS NOT NULL AND p."postalCode" <> ''
                                AND p."ownerId" IS NOT NULL ${countryFilter}`,
                        Prisma.sql`SELECT 'zips' AS facet, p.zip AS value FROM "Parcel" p
                                WHERE p.zip IS NOT NULL AND p.zip <> ''
                                AND p."ownerId" IS NOT NULL ${countryFilter}`,
                    ], ' UNION ALL ')}
                ) all_facets
                WHERE value IS NOT NULL AND value <> ''
                GROUP BY facet
            `);

            const byFacet: Record<string, string[]> = {};
            facetRows.forEach((r) => { byFacet[r.facet] = r.values; });

            const isCA = isCanada(countryParam);
            const cities = dedupeDisplayValues(byFacet.cities || []);
            const counties = dedupeDisplayValues(byFacet.counties || []);
            const zips = dedupeDisplayValues(byFacet.zips || []);
            const states = dedupeDisplayValues((byFacet.states || []).map((s) => ABBR_TO_PROVINCE[s] || s));
            return NextResponse.json({
                cities: isCA ? filterOfficialCanadianCities(cities) : cities,
                states,
                counties: isCA ? filterOfficialCanadianCounties(counties) : counties,
                zips: isCA ? filterCanadianPostalCodes(zips) : zips
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

        // One row per parcel that has a tower, so paginate on Parcel itself.
        // Parcel.towerId is required, so every parcel already has a tower.
        const parcelQuery: Prisma.ParcelWhereInput = { ...parcelWhere };

        // Global text search: each term must match the owner or the parcel.
        const search = searchParams.get('search');
        if (search) {
            const terms = search.split(/\s+/).filter(Boolean);
            const ownerMatch = (term: string): any => ({
                OR: [
                    { name: { contains: term, mode: 'insensitive' } },
                    { address: { contains: term, mode: 'insensitive' } },
                    { type: { contains: term, mode: 'insensitive' } },
                    { contacts: { some: { value: { contains: term, mode: 'insensitive' } } } },
                ],
            });
            const parcelMatch = (term: string): any => ({
                OR: [
                    { address: { contains: term, mode: 'insensitive' } },
                    { cityRaw: { contains: term, mode: 'insensitive' } },
                    { city: { name: { contains: term, mode: 'insensitive' } } },
                    { countyRaw: { contains: term, mode: 'insensitive' } },
                    { provinceRaw: { contains: term, mode: 'insensitive' } },
                    { stateRaw: { contains: term, mode: 'insensitive' } },
                    { postalCode: { contains: term, mode: 'insensitive' } },
                    { zip: { contains: term, mode: 'insensitive' } },
                ],
            });
            parcelQuery.AND = terms.map((term) => ({
                OR: [{ owner: ownerMatch(term) }, ...parcelMatch(term).OR],
            }));
        }

        // Paginate in the database: one row per parcel, only the columns the table shows.
        const [parcels, total] = await Promise.all([
            prisma.parcel.findMany({
                where: parcelQuery,
                skip,
                take: limit,
                orderBy: { id: 'asc' } as Prisma.ParcelOrderByWithRelationInput,
                select: {
                    id: true,
                    towerId: true,
                    parcelId: true,
                    address: true,
                    cityRaw: true,
                    countyRaw: true,
                    stateRaw: true,
                    provinceRaw: true,
                    postalCode: true,
                    zip: true,
                    city: { select: { name: true } },
                    province: { select: { name: true } },
                    countyNormalized: { select: { name: true } },
                    owner: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            address: true,
                            contacts: { select: { type: true, value: true } }
                        }
                    }
                }
            }),
            prisma.parcel.count({ where: parcelQuery })
        ]);

        const rows = parcels.map((parcel) => {
            const owner = parcel.owner;
            const contacts = owner?.contacts ?? [];
            return {
                // Parcel id is unique, so the grid key is stable across pages.
                id: `parcel-${parcel.id}`,
                ownerId: owner?.id ?? null,
                ownerName: owner?.name || 'Unknown',
                ownerType: owner?.type || '',
                ownerAddress: owner?.address || '',
                parcelId: parcel.parcelId || 'Unknown',
                address: parcel.address || '',
                city: parcel.city?.name || parcel.cityRaw || '',
                county: parcel.countyNormalized?.name || parcel.countyRaw || '',
                state: parcel.province?.name || parcel.provinceRaw || parcel.stateRaw || '',
                zip: parcel.postalCode || parcel.zip || '',
                phones: contacts.filter((c) => c.type === 'Phone').map((c) => c.value),
                emails: contacts.filter((c) => c.type === 'Email').map((c) => c.value),
                towerCount: 1,
                towerIds: [parcel.towerId]
            };
        });

        return NextResponse.json({
            data: rows,
            total,
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
    try { await getAuthUser(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
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
