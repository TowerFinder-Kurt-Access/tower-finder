import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import axios from 'axios';
import { requireAdmin } from '@/lib/auth-helpers';

// Sleep helper to respect Nominatim rate limits (1 req/sec)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
    try { await requireAdmin(); } catch (e:any) { return NextResponse.json({ error: (e as Error).message || 'Unauthorized' }, { status: e?.message?.includes('Forbidden')?403:401 }); }
    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') || 'missing'; // 'missing' or 'all'
        const limit = parseInt(searchParams.get('limit') || '5');

        let whereClause: any = {};
        if (mode === 'missing') {
            whereClause = {
                OR: [
                    { province: null },
                    { province: '' }
                ]
            };
        }

        const leads = await prisma.towerLead.findMany({
            where: whereClause,
            take: limit,
            orderBy: { id: 'asc' }
        });

        if (leads.length === 0) {
            return NextResponse.json({ message: 'No leads to process', processed: 0, updated: 0, remaining: 0 });
        }

        const results = [];
        let updatedCount = 0;

        for (const lead of leads) {
            if (!lead.lat || !lead.lon) {
                results.push({ id: lead.id, status: 'skipped', reason: 'no_coords' });
                continue;
            }

            try {
                // Call Nominatim API
                // Nominatim usage policy requires a valid User-Agent
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lead.lat}&lon=${lead.lon}`;
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'TowerFinderApp/1.0' }
                });

                const address = response.data.address;
                // Nominatim returns state, region, state_district depending on location
                const province = address?.state || address?.region || address?.state_district;

                if (province) {
                    await prisma.towerLead.update({
                        where: { id: lead.id },
                        data: { province: province }
                    });
                    results.push({ id: lead.id, status: 'updated', province });
                    updatedCount++;
                } else {
                    results.push({ id: lead.id, status: 'failed', reason: 'no_province_in_response', address });
                }

            } catch (error: any) {
                console.error(`Failed to geocode lead ${lead.id}:`, error.message);
                results.push({ id: lead.id, status: 'error', error: error.message });
            }

            // Respect rate limit: absolute minimum 1 sec between requests
            await sleep(1100);
        }

        const remaining = await prisma.towerLead.count({ where: whereClause });

        return NextResponse.json({
            processed: results.length,
            updated: updatedCount,
            results,
            remaining,
            message: `Processed ${results.length} leads. ${updatedCount} updated. ${remaining} remaining.`
        });

    } catch (error: any) {
        console.error('Error in fix-provinces:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET() {
    try { await requireAdmin(); } catch (e:any) { return NextResponse.json({ error: (e as Error).message || 'Unauthorized' }, { status: e?.message?.includes('Forbidden')?403:401 }); }
    try {
        const count = await prisma.towerLead.count({
            where: {
                OR: [
                    { province: null },
                    { province: '' }
                ]
            }
        });
        return NextResponse.json({ missingProvincesCount: count });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to count' }, { status: 500 });
    }
}
