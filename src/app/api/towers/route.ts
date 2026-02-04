import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/towers - List all towers
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const state = searchParams.get('state');
        const id = searchParams.get('id');
        const limitStr = searchParams.get('limit');
        const pageStr = searchParams.get('page');
        const distinct = searchParams.get('distinct'); // For fetching distinct values
        const city = searchParams.get('city'); // Filter by city
        const zip = searchParams.get('zip'); // Filter by zip
        const limit = limitStr ? parseInt(limitStr) : undefined;
        const page = pageStr ? parseInt(pageStr) : undefined;
        // Bounding box support
        const bbox = searchParams.get('bbox'); // minLon,minLat,maxLon,maxLat

        // Handle distinct values request
        if (distinct === 'filters') {
            const towers = await prisma.tower.findMany({
                select: {
                    parcel: {
                        select: {
                            city: true,
                            state: true,
                            zip: true
                        }
                    }
                }
            });

            const cities = [...new Set(towers.map(t => t.parcel?.city).filter(Boolean))].sort();
            const states = [...new Set(towers.map(t => t.parcel?.state).filter(Boolean))].sort();
            const zips = [...new Set(towers.map(t => t.parcel?.zip).filter(Boolean))].sort();

            return NextResponse.json({
                cities,
                states,
                zips
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
            if (state) {
                const mapped = PROVINCE_MAPPING[state];
                const terms = [state];
                if (mapped) terms.push(mapped);

                // QC usually appears as ", QC" or " QC " in addresses to avoid matching matching words like "abc"
                // But ILIKE is simple. Let's just search for the strings.

                whereClause = {
                    OR: [
                        // 1. Search in structured state column (if it exists)
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
                };
            }

            if (bbox) {
                const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
                whereClause = {
                    ...whereClause,
                    lat: { gte: minLat, lte: maxLat },
                    lon: { gte: minLon, lte: maxLon }
                };
            }

            // Add city filter
            if (city) {
                whereClause = {
                    ...whereClause,
                    parcel: {
                        ...whereClause.parcel,
                        city: { equals: city, mode: 'insensitive' }
                    }
                };
            }

            // Add zip filter
            if (zip) {
                whereClause = {
                    ...whereClause,
                    parcel: {
                        ...whereClause.parcel,
                        zip: { equals: zip, mode: 'insensitive' }
                    }
                };
            }
        }

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
        console.error('Error fetching towers:', error);
        return NextResponse.json({ error: 'Failed to fetch towers' }, { status: 500 });
    }
}

// POST /api/towers - Create a new tower if it doesn't exist (based on lat/lon)
export async function POST(request: Request) {
    try {
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
        console.error('Error creating tower:', error);
        return NextResponse.json({ error: 'Failed to create tower' }, { status: 500 });
    }
}
