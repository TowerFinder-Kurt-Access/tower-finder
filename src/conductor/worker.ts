import { prisma } from '@/lib/prisma';
import { pickNextJob, markCompleted, markFailed } from '@/lib/job-queue';
import { JOB_HANDLERS } from '@/lib/job-handlers';

/**
 * Standalone Discovery Worker
 * 
 * Polls the JobQueue for fcc_rooftop_discovery jobs and processes them locally.
 * This must run on a machine with Playwright/Chromium (your PC), not on Vercel.
 * 
 * Usage: npx tsx src/conductor/worker.ts
 * 
 * Supports filtering by job type via --type flag:
 *   npx tsx src/conductor/worker.ts --type fcc_rooftop_discovery
 */

/** Retry a function up to N times with delay on transient DB errors */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err: any) {
            const isTransient = err?.code === 'P1001' || err?.code === 'P1002' || err?.message?.includes("Can't reach database");
            if (isTransient && i < retries - 1) {
                console.warn(`[Worker] DB transient error, retrying in ${delayMs / 1000}s... (attempt ${i + 1}/${retries})`);
                await new Promise(res => setTimeout(res, delayMs));
                continue;
            }
            throw err;
        }
    }
    throw new Error('withRetry exhausted'); // unreachable
}

async function main() {
    const typeFilter = process.argv.find(a => a.startsWith('--type='))?.split('=')[1]
        || (process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : null);

    console.log('[Worker] Starting AT&T Discovery Worker...');
    if (typeFilter) {
        console.log(`[Worker] Filtering for job type: ${typeFilter}`);
    }

    // Graceful Shutdown Handler
    let running = true;
    const shutdown = async () => {
        console.log('[Worker] Shutting down gracefully...');
        running = false;
        try { await prisma.$disconnect(); } catch {}
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    let processedTotal = 0;
    let consecutiveDbErrors = 0;

    while (running) {
        // Pick next job — wrapped in retry for transient DB issues
        let job;
        try {
            job = await withRetry(() => pickNextJob(typeFilter || undefined));
            consecutiveDbErrors = 0; // reset on success
        } catch (err: any) {
            consecutiveDbErrors++;
            console.error(`[Worker] Failed to pick job (${consecutiveDbErrors} consecutive DB errors):`, err.message);
            // Back off exponentially: 10s, 20s, 40s, ... max 5 min
            const backoff = Math.min(10000 * Math.pow(2, consecutiveDbErrors - 1), 300000);
            console.log(`[Worker] Backing off for ${backoff / 1000}s...`);
            await new Promise(res => setTimeout(res, backoff));
            continue;
        }

        if (!job) {
            // Show idle status periodically
            if (processedTotal > 0 && processedTotal % 10 === 0) {
                try {
                    const scans = await withRetry(() => (prisma as any).discoveryScan.findMany({
                        where: { status: 'running' }
                    }));
                    for (const scan of scans) {
                        const pct = ((scan.completedCells / scan.totalCells) * 100).toFixed(2);
                        console.log(`[Worker] 📊 ${scan.state}: ${scan.completedCells}/${scan.totalCells} (${pct}%) — ${scan.foundLeads} leads`);
                    }
                } catch {} // non-critical, just skip progress display
            }
            await new Promise(res => setTimeout(res, 5000));
            continue;
        }

        console.log(`[Worker] Picking up job ${job.id} (${job.jobType})`);

        const handler = JOB_HANDLERS[job.jobType];
        if (!handler) {
            console.warn(`[Worker] Unknown job type: ${job.jobType}, skipping.`);
            try { await withRetry(() => markFailed(job!.id, `Unknown job type: ${job!.jobType}`)); } catch {}
            continue;
        }

        try {
            const result = await handler(job.params as Record<string, any>);
            await withRetry(() => markCompleted(job!.id, result));
            processedTotal++;
            console.log(`[Worker] ✅ Job ${job.id} completed. Total processed: ${processedTotal}`);
        } catch (error: any) {
            console.error(`[Worker] ❌ Job ${job.id} failed:`, error.message);
            try {
                await withRetry(() => markFailed(job!.id, error.message));
            } catch (dbErr: any) {
                // If we can't even mark it failed, log and move on.
                // Job will stay "processing" and can be manually reset.
                console.error(`[Worker] ⚠️ Could not mark job ${job.id} as failed (DB error):`, dbErr.message);
            }
        }

        // Small delay between jobs to avoid rate-limiting
        await new Promise(res => setTimeout(res, 2000));
    }
}

main().catch(err => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});
