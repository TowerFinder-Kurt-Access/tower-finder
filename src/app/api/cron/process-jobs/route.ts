import { NextResponse } from 'next/server';
import { pickNextJob, markCompleted, markFailed, enqueueJob } from '@/lib/job-queue';
import { JOB_HANDLERS } from '@/lib/job-handlers';
import { GeoapifyQuotaError } from '@/services/GeoapifyService';
import { auth } from '@/lib/auth';
import { Role, prisma } from '@prisma/client';

/**
 * GET /api/cron/process-jobs
 * 
 * Main Entry Point for all scheduled tasks.
 * On Vercel Hobby, this runs once daily. 
 * We process multiple jobs in a single run and trigger new batches if needed.
 */
export async function GET(request: Request) {
    const results = [];
    const MAX_JOBS_PER_RUN = 5;

    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        const session = await auth();
        const isAdmin = session?.user?.role === Role.ADMIN;

        if (!isAdmin && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. If no jobs are pending, trigger the initial batches for all key services
        const pendingCount = await (prisma as any).jobQueue.count({ where: { status: 'pending' } });
        if (pendingCount === 0) {
            console.log('[Cron] No pending jobs. Triggering initial batches...');
            await enqueueJob('validate_phone_numbers', { batchSize: 50 });
            await enqueueJob('process_nrcan_batch', {});
            await enqueueJob('submit_geoapify_batch', {});
        }

        // 2. Process up to MAX_JOBS_PER_RUN
        let jobsProcessed = 0;
        while (jobsProcessed < MAX_JOBS_PER_RUN) {
            const job = await pickNextJob();
            if (!job) break;

            jobsProcessed++;
            console.log(`[Cron] Processing job ${job.id} (type: ${job.jobType}, attempt: ${job.attempts})`);

            const handler = JOB_HANDLERS[job.jobType];
            if (!handler) {
                await markFailed(job.id, `Unknown job type: ${job.jobType}`);
                results.push({ jobId: job.id, status: 'failed', error: 'Unknown type' });
                continue;
            }

            try {
                const result = await handler(job.params as Record<string, any>);
                await markCompleted(job.id, result);
                results.push({ jobId: job.id, status: 'completed', result });
            } catch (handlerError) {
                const errorMessage = handlerError instanceof Error ? handlerError.message : 'Unknown error';
                console.error(`[Cron] Job ${job.id} failed:`, errorMessage);

                if (handlerError instanceof GeoapifyQuotaError || (errorMessage && errorMessage.includes('Phone validation quota reached'))) {
                    const runAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    await markFailed(job.id, errorMessage, runAfter);
                    results.push({ jobId: job.id, status: 'rescheduled', error: errorMessage });
                } else {
                    await markFailed(job.id, errorMessage);
                    results.push({ jobId: job.id, status: 'failed', error: errorMessage });
                }
            }
        }

        return NextResponse.json({
            message: 'Cron run finished',
            processedCount: jobsProcessed,
            results
        });

    } catch (error) {
        console.error('[Cron] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal cron error' }, { status: 500 });
    }
}
