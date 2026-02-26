import { prisma } from '@/lib/prisma';

/**
 * Generic job queue utilities.
 * All job types share this queue — the cron runner picks one job at a time.
 */

/** Enqueue a new job */
export async function enqueueJob(jobType: string, params: Record<string, any>, runAfter?: Date) {
    return prisma.jobQueue.create({
        data: {
            jobType,
            status: 'pending',
            params,
            runAfter: runAfter ?? undefined,
        },
    });
}

/**
 * Pick the next pending job that is ready to run.
 * Atomically sets status to 'processing' to prevent double-picks.
 * Respects runAfter (scheduled jobs) and maxAttempts (retry limit).
 */
export async function pickNextJob() {
    const now = new Date();

    // Find the oldest pending job that's ready to run
    const job = await prisma.jobQueue.findFirst({
        where: {
            status: 'pending',
            runAfter: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
    });

    if (!job) return null;

    // Extra check: attempts < maxAttempts
    if (job.attempts >= job.maxAttempts) {
        await prisma.jobQueue.update({
            where: { id: job.id },
            data: { status: 'failed', error: 'Max attempts exceeded' },
        });
        return null;
    }

    // Atomically claim the job
    const updated = await prisma.jobQueue.updateMany({
        where: {
            id: job.id,
            status: 'pending', // Only claim if still pending (prevents races)
        },
        data: {
            status: 'processing',
            startedAt: now,
            attempts: { increment: 1 },
        },
    });

    if (updated.count === 0) {
        // Another worker claimed it
        return null;
    }

    // Return the latest version
    return prisma.jobQueue.findUnique({ where: { id: job.id } });
}

/** Mark a job as completed */
export async function markCompleted(jobId: number, result?: Record<string, any>) {
    return prisma.jobQueue.update({
        where: { id: jobId },
        data: {
            status: 'completed',
            completedAt: new Date(),
            result: result ?? undefined,
        },
    });
}

/** Mark a job as failed. If retries remain, reset to pending with a delay. */
export async function markFailed(jobId: number, error: string, runAfterOverride?: Date) {
    const job = await prisma.jobQueue.findUnique({ where: { id: jobId } });
    if (!job) return;

    if (job.attempts < job.maxAttempts || runAfterOverride) {
        // Retry: set back to pending with exponential backoff or custom delay
        const delayMs = Math.pow(2, job.attempts) * 30_000; // 30s, 60s, 120s, ...
        const runAfter = runAfterOverride ?? new Date(Date.now() + delayMs);

        return prisma.jobQueue.update({
            where: { id: jobId },
            data: {
                status: 'pending',
                error,
                runAfter,
            },
        });
    } else {
        // No more retries
        return prisma.jobQueue.update({
            where: { id: jobId },
            data: {
                status: 'failed',
                error,
                completedAt: new Date(),
            },
        });
    }
}
