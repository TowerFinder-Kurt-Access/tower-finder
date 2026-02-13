import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireAdmin } from '@/lib/auth-helpers';
import { buildTowerAccessFilter } from '@/lib/tower-access';

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
        const city = searchParams.get('city'); // Filter by city
        const county = searchParams.get('county'); // Filter by county
        const zip = searchParams.get('zip'); // Filter by zip
        const typeFilter = searchParams.get('type');
        const carrierFilter = searchParams.get('carrier');
        const licenseeFilter = searchParams.get('licensee');
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

        // Handle distinct values request - use normalized tables when available
        if (distinct === 'filters') {
            // Use normalized relation names when available, fall back to raw values
            const [citiesResult, statesResult, countiesResult, zipsResult] = await Promise.all([
                // City: prefer City table names, union with cityRaw for unlinked parcels
                prisma.$queryRaw<{ city: string }[]>`
                    SELECT DISTINCT name as city FROM (
                        SELECT c."name" FROM "City" c
                        UNION
                        SELECT p."cityRaw" as name FROM "Parcel" p WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" != '' AND p."cityId" IS NULL
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
                `,
                // Province: prefer Province table names, union with stateRaw for unlinked parcels
                prisma.$queryRaw<{ state: string }[]>`
                    SELECT DISTINCT name as state FROM (
                        SELECT pr."name" FROM "Province" pr
                        UNION
                        SELECT p."stateRaw" as name FROM "Parcel" p WHERE p."stateRaw" IS NOT NULL AND p."stateRaw" != '' AND p."provinceId" IS NULL
                        UNION
                        SELECT p."provinceRaw" as name FROM "Parcel" p WHERE p."provinceRaw" IS NOT NULL AND p."provinceRaw" != '' AND p."provinceId" IS NULL
                    ) combined
                    WHERE name IS NOT NULL AND name != ''
                    ORDER BY name
                `,
                prisma.$queryRaw<{ county: string }[]>`
                    SELECT DISTINCT county FROM "Parcel"
                    WHERE county IS NOT NULL AND county != ''
                    ORDER BY county
                `,
                // Zip: use COALESCE to match display logic (postalCode ?? zip)
                prisma.$queryRaw<{ zip: string }[]>`
                    SELECT DISTINCT COALESCE("postalCode", zip) as zip FROM "Parcel"
                    WHERE COALESCE("postalCode", zip) IS NOT NULL AND COALESCE("postalCode", zip) != ''
                    ORDER BY zip
                `
            ]);

            return NextResponse.json({
                cities: citiesResult.map(r => r.city),
                states: statesResult.map(r => r.state),
                counties: countiesResult.map(r => r.county),
                zips: zipsResult.map(r => r.zip)
            });
        }

        if (distinct === 'lookups') {
            const [types, carriers, licensees] = await Promise.all([
                prisma.towerType.findMany({ orderBy: { name: 'asc' } }),
                prisma.carrier.findMany({ orderBy: { name: 'asc' } }),
                prisma.licensee.findMany({ orderBy: { name: 'asc' } })
            ]);

            return NextResponse.json({
                types,
                carriers,
                licensees
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

            // State filter - match on province-related fields only
            if (state) {
                const mapped = PROVINCE_MAPPING[state];
                const terms = [state];
                if (mapped) terms.push(mapped);

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
                // Search both raw cityRaw and normalized City relation
                andConditions.push({
                    parcel: {
                        OR: [
                            { cityRaw: { equals: city, mode: 'insensitive' } },
                            { city: { name: { equals: city, mode: 'insensitive' } } }
                        ]
                    }
                });
            }

            if (county) {
                parcelFilters.county = { equals: county, mode: 'insensitive' };
            }

            if (zip) {
                // Search both postalCode and zip to match display logic
                andConditions.push({
                    parcel: {
                        OR: [
                            { postalCode: { equals: zip, mode: 'insensitive' } },
                            { zip: { equals: zip, mode: 'insensitive' } }
                        ]
                    }
                });
            }

            // Relation filters
            if (typeFilter) {
                andConditions.push({
                    type: {
                        name: { equals: typeFilter, mode: 'insensitive' }
                    }
                });
            }

            if (carrierFilter) {
                andConditions.push({
                    carrier: {
                        name: { equals: carrierFilter, mode: 'insensitive' }
                    }
                });
            }

            if (licenseeFilter) {
                andConditions.push({
                    licensee: {
                        name: { equals: licenseeFilter, mode: 'insensitive' }
                    }
                });
            }

            if (statusFilter) {
                andConditions.push({
                    status: { equals: statusFilter, mode: 'insensitive' }
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
                    licensee: true,
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
                // If it exists, we might want to update type if provided, or leave as is
                type: type || undefined,
                status: status || undefined
            },
            create: {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                // type: type || 'Unknown',  // TODO: Fix POST to use lookup inputs
                status: status || 'New'
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
