import { NextResponse } from 'next/server';
import { enqueueJob } from '@/lib/job-queue';
import { auth } from '@/lib/auth';
import { Role } from '@prisma/client';

/**
 * GET /api/cron/trigger-nrcan
 * 
 * Manually trigger the NRCan batch processing job for parcel fetching.
 * This can also be set up as a scheduled cron.
 */
export async function GET(request: Request) {
    try {
        // Simple check for cron secret if needed
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Check for session-based auth (for admin dashboard buttons)
        const session = await auth();
        const isAdmin = session?.user?.role === Role.ADMIN;

        // Only enforce if CRON_SECRET is set and user is not an admin
        if (!cronSecret) return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 });
        if (!isAdmin && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const job = await enqueueJob('process_nrcan_batch', {});

        return NextResponse.json({
            message: 'NRCan parcel processing batch job enqueued',
            jobId: job.id
        });
    } catch (error: any) {
        console.error('Failed to trigger NRCan job:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
