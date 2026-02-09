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
        const limit = limitStr ? parseInt(limitStr) : undefined;
        const page = pageStr ? parseInt(pageStr) : undefined;
        // Bounding box support
        const bbox = searchParams.get('bbox'); // minLon,minLat,maxLon,maxLat

        // Handle distinct values request - optimized with raw queries
        if (distinct === 'filters') {
            const [citiesResult, statesResult, countiesResult, zipsResult] = await Promise.all([
                prisma.$queryRaw<{ city: string }[]>`
                    SELECT DISTINCT city FROM "Parcel"
                    WHERE city IS NOT NULL AND city != ''
                    ORDER BY city
                `,
                prisma.$queryRaw<{ state: string }[]>`
                    SELECT DISTINCT state FROM "Parcel"
                    WHERE state IS NOT NULL AND state != ''
                    ORDER BY state
                `,
                prisma.$queryRaw<{ county: string }[]>`
                    SELECT DISTINCT county FROM "Parcel"
                    WHERE county IS NOT NULL AND county != ''
                    ORDER BY county
                `,
                prisma.$queryRaw<{ zip: string }[]>`
                    SELECT DISTINCT zip FROM "Parcel"
                    WHERE zip IS NOT NULL AND zip != ''
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

            // State filter - uses OR for matching state/province/source
            if (state) {
                const mapped = PROVINCE_MAPPING[state];
                const terms = [state];
                if (mapped) terms.push(mapped);

                andConditions.push({
                    OR: [
                        // 1. Search in structured state column
                        {
                            parcel: {
                                state: { in: terms, mode: 'insensitive' }
                            }
                        },
                        // 2. Search in Source (files often named 'BC_Jan11.xlsx')
                        ...terms.map(t => ({
                            source: { contains: t, mode: 'insensitive' as const }
                        })),
                        // 3. Search in Address string
                        ...terms.map(t => ({
                            parcel: {
                                address: { contains: t, mode: 'insensitive' as const }
                            }
                        }))
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
                parcelFilters.city = { equals: city, mode: 'insensitive' };
            }

            if (county) {
                parcelFilters.county = { equals: county, mode: 'insensitive' };
            }

            if (zip) {
                parcelFilters.zip = { equals: zip, mode: 'insensitive' };
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
                            owner: true
                        }
                    },
                    _count: {
                        select: { notes: true }
                    }
                },
                skip,
                take
            }),
            needsCount ? prisma.tower.count({ where: whereClause }) : Promise.resolve(undefined)
        ]);

        console.log(`[API /api/towers] Returning ${towers.length} towers`);

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
                type: type || 'Unknown',
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
