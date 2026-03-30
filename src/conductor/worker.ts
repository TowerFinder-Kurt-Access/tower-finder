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
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    let processedTotal = 0;

    while (running) {
        const job = await pickNextJob(typeFilter || undefined);

        if (!job) {
            // Show idle status periodically
            if (processedTotal > 0 && processedTotal % 10 === 0) {
                // Check overall progress
                const scans = await (prisma as any).discoveryScan.findMany({
                    where: { status: 'running' }
                });
                for (const scan of scans) {
                    const pct = ((scan.completedCells / scan.totalCells) * 100).toFixed(2);
                    console.log(`[Worker] 📊 ${scan.state}: ${scan.completedCells}/${scan.totalCells} (${pct}%) — ${scan.foundLeads} leads`);
                }
            }
            // Idle for 5 seconds if no jobs
            await new Promise(res => setTimeout(res, 5000));
            continue;
        }

        console.log(`[Worker] Picking up job ${job.id} (${job.jobType})`);

        const handler = JOB_HANDLERS[job.jobType];
        if (!handler) {
            console.warn(`[Worker] Unknown job type: ${job.jobType}, skipping.`);
            await markFailed(job.id, `Unknown job type: ${job.jobType}`);
            continue;
        }

        try {
            const result = await handler(job.params as Record<string, any>);
            await markCompleted(job.id, result);
            processedTotal++;
            console.log(`[Worker] ✅ Job ${job.id} completed. Total processed: ${processedTotal}`);
        } catch (error: any) {
            console.error(`[Worker] ❌ Job ${job.id} failed:`, error.message);
            await markFailed(job.id, error.message);
        }

        // Small delay between jobs to avoid rate-limiting
        await new Promise(res => setTimeout(res, 2000));
    }
}

main().catch(err => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});
