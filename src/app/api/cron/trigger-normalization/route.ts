import { NextResponse } from 'next/server';
import { enqueueJob } from '@/lib/job-queue';
import { auth } from '@/lib/auth';
import { Role } from '@prisma/client';

/**
 * GET /api/cron/trigger-normalization
 * 
 * Manually trigger the Location Normalization batch processing job.
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        const session = await auth();
        const isAdmin = session?.user?.role === Role.ADMIN;

        if (!isAdmin && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            const url = new URL(request.url);
            if (url.searchParams.get('secret') !== cronSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const job = await enqueueJob('normalize_locations', { batchSize: 50 });

        return NextResponse.json({
            message: 'Location normalization job enqueued',
            jobId: job.id
        });
    } catch (error: any) {
        console.error('Failed to trigger normalization job:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
