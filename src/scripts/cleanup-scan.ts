import { prisma } from '../lib/prisma';

/**
 * Cleanup Scan
 * 
 * Deletes a DiscoveryScan record and all associated jobs from the queue.
 * Used for resetting a scan to start fresh with new boundaries or resolutions.
 * 
 * Usage: npx tsx src/scripts/cleanup-scan.ts --state Chicago
 */
async function main() {
    const stateArg = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]
        || process.argv[process.argv.indexOf('--state') + 1]
        || 'Chicago';

    console.log(`[Admin] Cleaning up discovery for ${stateArg}...`);

    // 1. Fetch jobs to filter by JSON params manually for robustness
    const allDiscoveryJobs = await prisma.jobQueue.findMany({
        where: {
            jobType: 'fcc_rooftop_discovery'
        },
        select: { id: true, params: true }
    });

    const jobsToDelete = allDiscoveryJobs.filter(job => 
        (job.params as any)?.state === stateArg || (job.params as any)?.scanId === stateArg
    );

    if (jobsToDelete.length > 0) {
        const jobIds = jobsToDelete.map(j => j.id);
        
        // Split into chunks for safety
        for (let i = 0; i < jobIds.length; i += 1000) {
            const chunk = jobIds.slice(i, i + 1000);
            await prisma.jobQueue.deleteMany({
                where: { id: { in: chunk } }
            });
        }
        
        console.log(`[Admin] ✅ Successfully deleted ${jobsToDelete.length} jobs.`);
    }

    // 2. Delete the Scan Record
    const scan = await (prisma as any).discoveryScan.deleteMany({
        where: { state: stateArg }
    });

    console.log(`[Admin] Deleted ${scan.count} DiscoveryScan(s) for ${stateArg}.`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('[Admin] Fatal error:', err);
    process.exit(1);
});
