import { prisma } from '@/lib/prisma';
import { AntennaSearchService } from '@/services/AntennaSearchService';
import { CellMapperService } from '@/services/CellMapperService';
import { pickNextJob, markCompleted, markFailed } from '@/lib/job-queue';
import { chromium } from 'playwright-extra';

/**
 * Main Standalone Worker Process
 * Polling loop for JobQueue
 */
async function main() {
    console.log('[Worker] Starting AT&T Discovery Worker...');

    // Graceful Shutdown Handler
    const shutdown = async () => {
        console.log('[Worker] Shutting down gracefully...');
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    while (true) {
        const job = await pickNextJob();

        if (!job) {
            // Idle for 10 seconds if no jobs
            await new Promise(res => setTimeout(res, 10000));
            continue;
        }

        console.log(`[Worker] Picking up job ${job.id} (${job.jobType})`);

        try {
            const { lat, lon, h3Index } = job.params as any;
            let result: any = {};

            if (job.jobType === 'scrape_all_sources') {
                const [antennas, signals] = await Promise.all([
                    AntennaSearchService.fetchAntennas(lat, lon),
                    CellMapperService.fetchTowers(lat, lon)
                ]);

                // Save results as TowerLeads (Raw Scrapes)
                for (const item of antennas) {
                    await prisma.towerLead.upsert({
                        where: { lat_lon_source: { lat: item.lat, lon: item.lon, source: 'AntennaSearch' } },
                        update: { tags: item },
                        create: {
                            lat: item.lat,
                            lon: item.lon,
                            source: 'AntennaSearch',
                            tags: item,
                            sourceId: item.registrationId
                        }
                    });
                }

                for (const item of signals) {
                    await prisma.towerLead.upsert({
                        where: { lat_lon_source: { lat: item.latitude, lon: item.longitude, source: 'CellMapper' } },
                        update: { tags: item },
                        create: {
                            lat: item.latitude,
                            lon: item.longitude,
                            source: 'CellMapper',
                            tags: item,
                            sourceId: String(item.id)
                        }
                    });
                }

                result = { foundAntennas: antennas.length, foundSignals: signals.length };
            }

            await markCompleted(job.id, result);
            console.log(`[Worker] Job ${job.id} completed.`);

        } catch (error: any) {
            console.error(`[Worker] Job ${job.id} failed:`, error.message);
            await markFailed(job.id, error.message);
        }
    }
}

main().catch(err => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});
