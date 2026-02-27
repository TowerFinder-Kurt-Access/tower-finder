import { NextResponse } from 'next/server';
import { pickNextJob, markCompleted, markFailed } from '@/lib/job-queue';
import { JOB_HANDLERS } from '@/lib/job-handlers';
import { GeoapifyQuotaError } from '@/services/GeoapifyService';
import { auth } from '@/lib/auth';
import { Role } from '@prisma/client';

/**
 * GET /api/cron/process-jobs
 * 
 * Vercel cron endpoint — picks the next pending job and executes it.
 * Runs one job per invocation. Cron schedule: every 5 minutes.
 */
export async function GET(request: Request) {
    try {
        // Verify cron secret (Vercel sets CRON_SECRET automatically)
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        // Check for session-based auth (for admin dashboard buttons)
        const session = await auth();
        const isAdmin = session?.user?.role === Role.ADMIN;

        if (!isAdmin && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Pick the next pending job
        const job = await pickNextJob();

        if (!job) {
            return NextResponse.json({ message: 'No pending jobs', processed: 0 });
        }

        console.log(`[Cron] Processing job ${job.id} (type: ${job.jobType}, attempt: ${job.attempts})`);

        // Find the handler for this job type
        const handler = JOB_HANDLERS[job.jobType];

        if (!handler) {
            await markFailed(job.id, `Unknown job type: ${job.jobType}`);
            return NextResponse.json({
                message: `Unknown job type: ${job.jobType}`,
                jobId: job.id,
                processed: 0,
            });
        }

        // Execute the handler
        try {
            const result = await handler(job.params as Record<string, any>);
            await markCompleted(job.id, result);

            console.log(`[Cron] Job ${job.id} completed successfully`);

            return NextResponse.json({
                message: 'Job completed',
                jobId: job.id,
                jobType: job.jobType,
                result,
                processed: 1,
            });
        } catch (handlerError) {
            const errorMessage = handlerError instanceof Error
                ? handlerError.message
                : 'Unknown handler error';

            console.error(`[Cron] Job ${job.id} failed:`, errorMessage);

            // Special handling for quota errors: reschedule for 24 hours later
            if (handlerError instanceof GeoapifyQuotaError) {
                const runAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await markFailed(job.id, errorMessage, runAfter);
                console.log(`[Cron] Quota error detected. Rescheduled job ${job.id} for ${runAfter.toISOString()}`);

                return NextResponse.json({
                    message: 'Job rescheduled due to quota',
                    jobId: job.id,
                    jobType: job.jobType,
                    rescheduledFor: runAfter.toISOString(),
                    processed: 0,
                });
            }

            await markFailed(job.id, errorMessage);

            return NextResponse.json({
                message: 'Job failed',
                jobId: job.id,
                jobType: job.jobType,
                error: errorMessage,
                processed: 0,
            });
        }
    } catch (error) {
        console.error('[Cron] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal cron error' },
            { status: 500 }
        );
    }
}
