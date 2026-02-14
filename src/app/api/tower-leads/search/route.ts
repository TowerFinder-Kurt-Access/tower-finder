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
        const { country, city } = body;

        if (!country || !city) {
            return NextResponse.json(
                { error: 'country and city are required' },
                { status: 400 }
            );
        }

        // Upsert the LeadSearch record (prevents duplicates)
        const leadSearch = await prisma.leadSearch.upsert({
            where: {
                country_city_source: { country, city, source: 'OpenStreetMap' },
            },
            update: {
                status: 'pending',
                error: null,
            },
            create: {
                country,
                city,
                source: 'OpenStreetMap',
                status: 'pending',
            },
        });

        // Enqueue a job to process the leads
        const job = await enqueueJob('process_open_street_map_leads', {
            country,
            city,
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
