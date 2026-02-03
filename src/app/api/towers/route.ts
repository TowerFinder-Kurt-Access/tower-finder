import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/towers - List all towers
export async function GET() {
    try {
        const towers = await prisma.tower.findMany({
            include: {
                parcel: {
                    include: {
                        owner: true
                    }
                }
            }
        });
        console.log(`[API /api/towers] Returning ${towers.length} towers`);
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
