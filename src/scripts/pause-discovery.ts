import { prisma } from '../lib/prisma';

/**
 * Pause Discovery Scan
 * 
 * Sets a DiscoveryScan to 'paused' and moves all associated pending jobs to 'held'.
 * This clears the active JobQueue so other scans can proceed.
 * 
 * Usage: npx tsx src/scripts/pause-discovery.ts --state Illinois
 */
async function main() {
    const stateArg = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]
        || process.argv[process.argv.indexOf('--state') + 1]
        || 'Illinois';

    console.log(`[Admin] Pausing discovery for ${stateArg}...`);

    // 1. Update Scan Status
    const scan = await (prisma as any).discoveryScan.updateMany({
        where: { state: stateArg, status: 'running' },
        data: { status: 'paused' }
    });

    console.log(`[Admin] Updated ${scan.count} DiscoveryScan(s) to 'paused'.`);

    // 2. Fetch all pending discovery jobs to filter by JSON params manually for robustness
    const pendingJobs = await prisma.jobQueue.findMany({
        where: {
            status: 'pending',
            jobType: 'fcc_rooftop_discovery'
        },
        select: { id: true, params: true }
    });

    const jobsToHold = pendingJobs.filter(job => 
        (job.params as any)?.state === stateArg || (job.params as any)?.scanId === stateArg
    );

    if (jobsToHold.length > 0) {
        const jobIds = jobsToHold.map(j => j.id);
        
        // Split into chunks of 1000 for safety
        for (let i = 0; i < jobIds.length; i += 1000) {
            const chunk = jobIds.slice(i, i + 1000);
            await prisma.jobQueue.updateMany({
                where: { id: { in: chunk } },
                data: { status: 'held' }
            });
        }
        
        console.log(`[Admin] ✅ Successfully moved ${jobsToHold.length} pending jobs to 'held' status.`);
    } else {
        console.log(`[Admin] No pending jobs found for ${stateArg}.`);
    }

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('[Admin] Fatal error:', err);
    process.exit(1);
});
