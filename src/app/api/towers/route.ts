import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAuthUser, requireAdmin } from '@/lib/auth-helpers';
import { buildTowerAccessFilter } from '@/lib/tower-access';
import { ABBR_TO_PROVINCE } from '@/lib/locations';

// GET /api/towers - List all towers
export async function GET(request: Request) {
    try {
        // Get authenticated user
        const user = await getAuthUser();

        const { searchParams } = new URL(request.url);
        const state = searchParams.get('state');
        const id = searchParams.get('id');
        const limitStr = searchParams.get('limit');
        const pageStr = searchParams.get('page');
        const distinct = searchParams.get('distinct'); // For fetching distinct values
        const country = searchParams.get('country'); // Filter by country

        const city = searchParams.get('city'); // Filter by city
        const county = searchParams.get('county'); // Filter by county
        const zip = searchParams.get('zip'); // Filter by zip
        const typeFilter = searchParams.get('type');
        const carrierFilter = searchParams.get('carrier');
        const statusFilter = searchParams.get('status');
        const address = searchParams.get('address');
        const owner = searchParams.get('owner');

        // Default limit to prevent sending too many towers at once (performance optimization)
        // Use 1000 as default limit if not specified, unless fetching by ID
        const DEFAULT_LIMIT = 1000;
        const limit = limitStr ? parseInt(limitStr) : (id ? undefined : DEFAULT_LIMIT);
        const page = pageStr ? parseInt(pageStr) : undefined; // Only set page if explicitly provided

        // Bounding box support
        const bbox = searchParams.get('bbox'); // minLon,minLat,maxLon,maxLat

        // Distinct Queries
        if (distinct === 'countries') {
            const result = await prisma.$queryRaw<{ country: string }[]>`
                SELECT DISTINCT country FROM "Parcel"
                WHERE country IS NOT NULL AND country != ''
                ORDER BY country
            `;
            return NextResponse.json(result.map(r => r.country));
        }

        if (distinct === 'provinces') {
            // Filter by country if provided
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;

            const result = await prisma.$queryRaw<{ state: string }[]>`
                SELECT DISTINCT name as state FROM (
                    SELECT pr."name" FROM "Province" pr
                    JOIN "Parcel" p ON p."provinceId" = pr.id
                    WHERE 1=1 ${countryFilter}
                    UNION
                    SELECT p."stateRaw" as name FROM "Parcel" p 
                    WHERE p."stateRaw" IS NOT NULL AND p."stateRaw" != '' 
                    ${countryFilter}
                    UNION
                    SELECT p."provinceRaw" as name FROM "Parcel" p 
                    WHERE p."provinceRaw" IS NOT NULL AND p."provinceRaw" != '' 
                    ${countryFilter}
                ) combined
                WHERE name IS NOT NULL AND name != ''
                ORDER BY name
            `;
            const provinces = new Set<string>();
            result.forEach(r => {
                const fullName = ABBR_TO_PROVINCE[r.state] || r.state;
                provinces.add(fullName);
            });
            return NextResponse.json(Array.from(provinces).sort());
        }

        if (distinct === 'cities') {
            // Filter by country and state if provided
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;

            let stateFilter = Prisma.sql``;
            if (state) {
                stateFilter = Prisma.sql`AND (
                    p."stateRaw" = ${state} OR 
                    p."provinceRaw" = ${state} OR 
                    EXISTS (SELECT 1 FROM "Province" pr WHERE pr.id = p."provinceId" AND pr.name = ${state})
                 )`;
            }

            const result = await prisma.$queryRaw<{ city: string }[]>`
                SELECT DISTINCT name as city FROM (
                    SELECT c."name" FROM "City" c
                    JOIN "Parcel" p ON p."cityId" = c.id
                    WHERE 1=1 ${countryFilter} ${stateFilter}
                    UNION
                    SELECT p."cityRaw" as name FROM "Parcel" p 
                    WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" != '' 
                    ${countryFilter} ${stateFilter}
                ) combined
                WHERE name IS NOT NULL AND name != ''
                ORDER BY name
             `;
            return NextResponse.json(result.map(r => r.city));
        }

        if (distinct === 'zips') {
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;
            let stateFilter = Prisma.sql``;
            if (state) {
                stateFilter = Prisma.sql`AND (
                    p."stateRaw" = ${state} OR 
                    p."provinceRaw" = ${state} OR 
                    EXISTS (SELECT 1 FROM "Province" pr WHERE pr.id = p."provinceId" AND pr.name = ${state})
                 )`;
            }

            const result = await prisma.$queryRaw<{ zip: string }[]>`
                SELECT DISTINCT name as zip FROM (
                    SELECT p."postalCode" as name FROM "Parcel" p
                    WHERE p."postalCode" IS NOT NULL AND p."postalCode" != ''
                    ${countryFilter} ${stateFilter}
                    UNION
                    SELECT p.zip as name FROM "Parcel" p
                    WHERE p.zip IS NOT NULL AND p.zip != ''
                    ${countryFilter} ${stateFilter}
                ) combined
                WHERE name IS NOT NULL AND name != ''
                ORDER BY name
            `;
            return NextResponse.json(result.map(r => r.zip));
        }

        if (distinct === 'filters') {
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;

            const [citiesResult, statesResult, countiesResult, zipsResult] = await Promise.all([
                prisma.$queryRaw<{ city: string }[]>`
                    SELECT DISTINCT name as city FROM (
                        SELECT c."name" FROM "City" c
                        JOIN "Parcel" p ON p."cityId" = c.id
                        WHERE 1=1 ${countryFilter}
                        UNION
                        SELECT p."cityRaw" as name FROM "Parcel" p
                        WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" != ''
                        ${countryFilter}
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
                `,
                prisma.$queryRaw<{ state: string }[]>`
                    SELECT DISTINCT name as state FROM (
                        SELECT pr."name" FROM "Province" pr
                        JOIN "Parcel" p ON p."provinceId" = pr.id
                        WHERE 1=1 ${countryFilter}
                        UNION
                        SELECT p."stateRaw" as name FROM "Parcel" p
                        WHERE p."stateRaw" IS NOT NULL AND p."stateRaw" != ''
                        ${countryFilter}
                        UNION
                        SELECT p."provinceRaw" as name FROM "Parcel" p
                        WHERE p."provinceRaw" IS NOT NULL AND p."provinceRaw" != ''
                        ${countryFilter}
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
                `,
                prisma.$queryRaw<{ county: string }[]>`
                    SELECT DISTINCT p.county
                    FROM "Parcel" p
                    WHERE p.county IS NOT NULL AND p.county != ''
                    ${countryFilter}
                    ORDER BY p.county
                `,
                prisma.$queryRaw<{ zip: string }[]>`
                    SELECT DISTINCT name as zip FROM (
                        SELECT p."postalCode" as name FROM "Parcel" p
                        WHERE p."postalCode" IS NOT NULL AND p."postalCode" != ''
                        ${countryFilter}
                        UNION
                        SELECT p.zip as name FROM "Parcel" p
                        WHERE p.zip IS NOT NULL AND p.zip != ''
                        ${countryFilter}
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

        // ... (lookups block)


        if (distinct === 'lookups') {
            const [types, carriers, statuses] = await Promise.all([
                prisma.towerType.findMany({ orderBy: { name: 'asc' } }),
                prisma.carrier.findMany({ orderBy: { name: 'asc' } }),
                prisma.towerStatus.findMany({ orderBy: { name: 'asc' } })
            ]);

            return NextResponse.json({
                types,
                carriers,
                statuses
            });
        }

        let whereClause: any = {};

        const PROVINCE_MAPPING: Record<string, string> = {
            'British Columbia': 'BC',
            'Alberta': 'AB',
            'Saskatchewan': 'SK',
            'Manitoba': 'MB',
            'Ontario': 'ON',
            'Quebec': 'QC',
            'New Brunswick': 'NB',
            'Nova Scotia': 'NS',
            'Prince Edward Island': 'PE',
            'Newfoundland and Labrador': 'NL',
            // Reverse
            'BC': 'British Columbia',
            'AB': 'Alberta',
            'SK': 'Saskatchewan',
            'MB': 'Manitoba',
            'ON': 'Ontario',
            'QC': 'Quebec',
            'NB': 'New Brunswick',
            'NS': 'Nova Scotia',
            'PE': 'Prince Edward Island',
            'NL': 'Newfoundland and Labrador'
        };

        if (id) {
            whereClause = { id: parseInt(id) };
        } else {
            // Build an array of conditions to AND together
            const andConditions: any[] = [];

            // Country filter
            if (country) {
                andConditions.push({
                    parcel: {
                        country: { equals: country, mode: 'insensitive' }
                    }
                });
            }

            // State filter - match on province-related fields only
            if (state) {
                const stateValues = state.split(',').filter(Boolean);
                const terms: string[] = [];
                stateValues.forEach(sv => {
                    terms.push(sv);
                    const mapped = PROVINCE_MAPPING[sv];
                    if (mapped) terms.push(mapped);
                });

                andConditions.push({
                    OR: [
                        // 1. Search in structured state/province raw columns
                        {
                            parcel: {
                                stateRaw: { in: terms, mode: 'insensitive' }
                            }
                        },
                        {
                            parcel: {
                                provinceRaw: { in: terms, mode: 'insensitive' }
                            }
                        },
                        // 2. Search in normalized Province relation (name and code)
                        {
                            parcel: {
                                province: { name: { in: terms, mode: 'insensitive' } }
                            }
                        },
                        {
                            parcel: {
                                province: { code: { in: terms, mode: 'insensitive' } }
                            }
                        }
                    ]
                });
            }

            // Bounding box filter
            if (bbox) {
                const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
                andConditions.push({
                    lat: { gte: minLat, lte: maxLat },
                    lon: { gte: minLon, lte: maxLon }
                });
            }

            // Build parcel filters
            const parcelFilters: any = {};

            if (city) {
                const cityValues = city.split(',').filter(Boolean);
                // Search both raw cityRaw and normalized City relation
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
                parcelFilters.county = { in: countyValues, mode: 'insensitive' };
            }

            if (zip) {
                const zipValues = zip.split(',').filter(Boolean);
                // Search both postalCode and zip to match display logic
                andConditions.push({
                    parcel: {
                        OR: [
                            { postalCode: { in: zipValues, mode: 'insensitive' } },
                            { zip: { in: zipValues, mode: 'insensitive' } }
                        ]
                    }
                });
            }

            // Relation filters
            if (typeFilter) {
                const typeValues = typeFilter.split(',').filter(Boolean);
                andConditions.push({
                    type: {
                        name: { in: typeValues, mode: 'insensitive' }
                    }
                });
            }

            if (carrierFilter) {
                const carrierValues = carrierFilter.split(',').filter(Boolean);
                andConditions.push({
                    carrier: {
                        name: { in: carrierValues, mode: 'insensitive' }
                    }
                });
            }

            if (statusFilter) {
                const statusValues = statusFilter.split(',').filter(Boolean);
                andConditions.push({
                    status: { name: { in: statusValues, mode: 'insensitive' } }
                });
            }

            if (address) {
                andConditions.push({
                    parcel: {
                        address: { contains: address, mode: 'insensitive' }
                    }
                });
            }

            if (owner) {
                andConditions.push({
                    parcel: {
                        owner: {
                            name: { contains: owner, mode: 'insensitive' }
                        }
                    }
                });
            }

            // Add parcel filters as a single condition if any exist
            if (Object.keys(parcelFilters).length > 0) {
                andConditions.push({
                    parcel: parcelFilters
                });
            }

            // Combine all conditions with AND
            if (andConditions.length > 0) {
                whereClause = {
                    AND: andConditions
                };
            }
        }

        // Apply role-based access control
        whereClause = buildTowerAccessFilter(user.id, user.role, whereClause);

        // Calculate pagination
        const skip = page !== undefined && limit !== undefined ? page * limit : undefined;
        const take = limit;

        // If pagination is requested, also get total count
        const needsCount = page !== undefined && limit !== undefined;

        const [towers, totalCount] = await Promise.all([
            prisma.tower.findMany({
                where: whereClause,
                include: {
                    parcel: {
                        include: {
                            owner: true,
                            city: true,
                            province: true
                        }
                    },
                    type: true,
                    carrier: true,
                    status: true,
                    _count: {
                        select: { notes: true }
                    }
                },
                orderBy: { id: 'asc' }, // Consistent ordering for pagination
                skip,
                take
            }),
            needsCount ? prisma.tower.count({ where: whereClause }) : Promise.resolve(undefined)
        ]);

        const limitApplied = limit !== undefined ? ` (limit: ${limit}, page: ${page || 0})` : '';
        console.log(`[API /api/towers] Returning ${towers.length} towers${limitApplied}${totalCount !== undefined ? ` of ${totalCount} total` : ''}`);

        // If pagination was used, return both data and count
        if (needsCount) {
            return NextResponse.json({
                data: towers,
                total: totalCount,
                page: page,
                limit: limit
            });
        }

        return NextResponse.json(towers);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching towers:', error);
        return NextResponse.json({ error: 'Failed to fetch towers' }, { status: 500 });
    }
}

// POST /api/towers - Create a new tower (admin only)
export async function POST(request: Request) {
    try {
        // Only admins can create towers
        await requireAdmin();

        const body = await request.json();
        const { lat, lon, type, status } = body;

        if (!lat || !lon) {
            return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
        }

        // Manual findOrCreate for type and status since names are no longer unique
        let typeId = undefined;
        if (type) {
            const existingType = await prisma.towerType.findFirst({ where: { name: type } });
            if (existingType) {
                typeId = existingType.id;
            } else {
                const newType = await prisma.towerType.create({ data: { name: type } });
                typeId = newType.id;
            }
        }

        let statusId = undefined;
        const statusName = status || 'New';
        const existingStatus = await prisma.towerStatus.findFirst({ where: { name: statusName } });
        if (existingStatus) {
            statusId = existingStatus.id;
        } else {
            const newStatus = await prisma.towerStatus.create({ data: { name: statusName } });
            statusId = newStatus.id;
        }

        // Upsert: Create if not found, or update if exists (though usually we just want to return existing)
        // Using upsert ensures we don't violate unique constraint
        const tower = await prisma.tower.upsert({
            where: {
                lat_lon: {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                }
            },
            update: {
                typeId: typeId || undefined,
                statusId: statusId,
                legacyStatus: status || undefined
            },
            create: {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                typeId: typeId || undefined,
                statusId: statusId,
                legacyStatus: status || 'New'
            }
        });

        return NextResponse.json(tower);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Forbidden')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }
        console.error('Error creating tower:', error);
        return NextResponse.json({ error: 'Failed to create tower' }, { status: 500 });
    }
}
