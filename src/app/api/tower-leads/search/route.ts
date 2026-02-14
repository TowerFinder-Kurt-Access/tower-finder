import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { enqueueJob } from '@/lib/job-queue';

/**
 * GET /api/tower-leads/search — List all LeadSearch records (search history)
 */
export async function GET() {
    try {
        await getAuthUser();

        const searches = await prisma.leadSearch.findMany({
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(searches);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching lead searches:', error);
        return NextResponse.json({ error: 'Failed to fetch lead searches' }, { status: 500 });
    }
}

/**
 * POST /api/tower-leads/search — Create a lead search and enqueue a job
 * Body: { country: string, city: string }
 */
export async function POST(request: Request) {
    try {
        await getAuthUser();

        const body = await request.json();
        const { country, province, city } = body;

        if (!country) {
            return NextResponse.json(
                { error: 'country is required' },
                { status: 400 }
            );
        }

        // Upsert the LeadSearch record (prevents duplicates)
        // Upsert the LeadSearch record (prevents duplicates)
        // Use empty strings for optional fields to avoid Prisma null constraint issues on unique keys
        const provinceVal = province || '';
        const cityVal = city || '';

        const leadSearch = await prisma.leadSearch.upsert({
            where: {
                country_province_city_source: {
                    country,
                    province: provinceVal,
                    city: cityVal,
                    source: 'OpenStreetMap'
                }
            },
            update: {
                status: 'pending',
                error: null,
            },
            create: {
                country,
                province: provinceVal,
                city: cityVal,
                source: 'OpenStreetMap',
                status: 'pending',
            },
        });

        // Enqueue a job to process the leads
        const job = await enqueueJob('process_open_street_map_leads', {
            country,
            province: provinceVal,
            city: cityVal,
        });

        return NextResponse.json({
            leadSearch,
            job: { id: job.id, status: job.status },
            message: `Lead search queued for ${city}, ${country}`,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error creating lead search:', error);
        return NextResponse.json({ error: 'Failed to create lead search' }, { status: 500 });
    }
}
