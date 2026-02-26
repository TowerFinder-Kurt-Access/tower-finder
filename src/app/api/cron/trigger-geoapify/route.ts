import { NextResponse } from 'next/server';
import { enqueueJob } from '@/lib/job-queue';

/**
 * GET /api/cron/trigger-geoapify
 * 
 * Manually trigger the Geoapify batch processing job.
 * This can also be set up as a scheduled cron.
 */
export async function GET(request: Request) {
    try {
        // Simple check for cron secret if needed
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Only enforce if CRON_SECRET is set
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            // For manual triggers during testing, we might allow it if no secret is provided in URL
            const url = new URL(request.url);
            if (url.searchParams.get('secret') !== cronSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const job = await enqueueJob('submit_geoapify_batch', {});

        return NextResponse.json({
            message: 'Geoapify batch submission job enqueued',
            jobId: job.id
        });
    } catch (error: any) {
        console.error('Failed to trigger Geoapify job:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
