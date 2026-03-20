import { NextResponse } from 'next/server';
import { enqueueJob } from '@/lib/job-queue';
import { auth } from '@/lib/auth';
import { Role } from '@prisma/client';

/**
 * GET /api/cron/trigger-phone-validation
 * 
 * Manually or automatically trigger the batch validation of phone numbers.
 * This enqueues the first batch, which then self-enqueues until all 'unknown'
 * numbers are processed.
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Check for session-based auth (for admin dashboard buttons)
        const session = await auth();
        const isAdmin = session?.user?.role === Role.ADMIN;

        if (!isAdmin && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            const url = new URL(request.url);
            if (url.searchParams.get('secret') !== cronSecret) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const job = await enqueueJob('validate_phone_numbers', { batchSize: 20 });

        return NextResponse.json({
            message: 'Phone validation batch job enqueued',
            jobId: job.id
        });
    } catch (error: any) {
        console.error('Failed to trigger phone validation job:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
