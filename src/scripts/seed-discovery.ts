import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '@/lib/prisma';
import { GridGenerator } from '@/lib/geo/GridGenerator';
import { enqueueJob } from '@/lib/job-queue';

/**
 * Seed Discovery for Illinois (or any state)
 * 
 * Generates H3 cells from the state GeoJSON boundary,
 * creates a DiscoveryScan record, and enqueues all jobs.
 * 
 * Usage: npx tsx src/scripts/seed-discovery.ts --state Illinois
 */
async function main() {
    const stateArg = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]
        || process.argv[process.argv.indexOf('--state') + 1]
        || 'Illinois';

    const country = 'US';
    const resolutionArg = process.argv.find(a => a.startsWith('--resolution='))?.split('=')[1]
        || process.argv[process.argv.indexOf('--resolution') + 1];
    const resolution = resolutionArg ? parseInt(resolutionArg) : 6;

    console.log(`[Seed] Starting discovery seed for ${stateArg} (${country})...`);

    // Load GeoJSON
    const geojsonPath = path.join(process.cwd(), 'data', `${stateArg.toLowerCase()}.geojson`);
    if (!fs.existsSync(geojsonPath)) {
        console.error(`[Seed] GeoJSON not found: ${geojsonPath}`);
        console.error(`[Seed] Please place a ${stateArg.toLowerCase()}.geojson file in the data/ directory.`);
        process.exit(1);
    }

    const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
    console.log(`[Seed] Loaded GeoJSON for ${stateArg}. Geometry type: ${geojson.geometry.type}`);

    // Generate H3 cells
    const cells = GridGenerator.generateCells(geojson, resolution);
    console.log(`[Seed] Generated ${cells.length} H3 cells at resolution ${resolution}`);

    // Create or update DiscoveryScan record
    const scan = await (prisma as any).discoveryScan.upsert({
        where: { state_country: { state: stateArg, country } },
        update: {
            totalCells: cells.length,
            completedCells: 0,
            failedCells: 0,
            foundLeads: 0,
            status: 'running',
            startedAt: new Date(),
            completedAt: null,
            h3Resolution: resolution
        },
        create: {
            state: stateArg,
            country,
            totalCells: cells.length,
            status: 'running',
            startedAt: new Date(),
            h3Resolution: resolution
        }
    });

    console.log(`[Seed] DiscoveryScan record created/updated: ID ${scan.id}`);

    // Enqueue jobs in batches
    let queued = 0;
    for (const h3Index of cells) {
        const [lat, lon] = GridGenerator.getCentroid(h3Index);

        await enqueueJob('fcc_rooftop_discovery', {
            state: stateArg,
            country,
            h3Index,
            lat,
            lon,
            scanId: scan.id
        });

        queued++;
        if (queued % 500 === 0) {
            console.log(`[Seed] Queued ${queued}/${cells.length} jobs...`);
        }
    }

    console.log(`[Seed] ✅ Successfully queued ${queued} jobs for ${stateArg}.`);
    console.log(`[Seed] Run the standalone worker to start processing:`);
    console.log(`[Seed]   npx tsx src/conductor/worker.ts`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
});
