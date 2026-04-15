import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CA_COUNTIES = [
    'Alameda', 'Alpine', 'Amador', 'Butte', 'Calaveras', 'Colusa', 'Contra Costa', 'Del Norte', 'El Dorado', 'Fresno', 
    'Glenn', 'Humboldt', 'Imperial', 'Inyo', 'Kern', 'Kings', 'Lake', 'Lassen', 'Los Angeles', 'Madera', 'Marin', 
    'Mariposa', 'Mendocino', 'Merced', 'Modoc', 'Mono', 'Monterery', 'Napa', 'Nevada', 'Orange', 'Placer', 'Plumas', 
    'Riverside', 'Sacramento', 'San Benito', 'San Bernardino', 'San Diego', 'San Francisco', 'San Joaquin', 
    'San Luis Obispo', 'San Mateo', 'Santa Barbara', 'Santa Clara', 'Santa Cruz', 'Shasta', 'Sierra', 'Siskiyou', 
    'Solano', 'Sonoma', 'Stanislaus', 'Sutter', 'Tehama', 'Trinity', 'Tulare', 'Tuolumne', 'Ventura', 'Yolo', 'Yuba'
];

async function resetAndSeed() {
    console.log('[RESET] Cleaning old California data...');
    
    // 1. Delete old job queue entries for FCC
    await prisma.jobQueue.deleteMany({
        where: {
            jobType: { in: ['fcc-discovery', 'fcc-discovery-county', 'fcc_rooftop_discovery'] }
        }
    });

    // 2. Clear all old discovery scans for California
    await prisma.discoveryScan.deleteMany({
        where: { state: 'California' }
    });

    console.log('[SEED] Creating new County-based Discovery Scan for California...');

    const scan = await prisma.discoveryScan.create({
        data: {
            state: 'California',
            country: 'US',
            status: 'pending',
            totalCounties: CA_COUNTIES.length,
            completedCounties: 0,
            failedCounties: 0,
            foundLeads: 0
        }
    });

    console.log(`[SEED] Discovery Scan ID ${scan.id} created.`);

    // 3. Populate JobQueue with one job per County
    console.log(`[SEED] Adding ${CA_COUNTIES.length} county jobs to queue...`);

    const jobs = CA_COUNTIES.map(county => ({
        jobType: 'fcc-discovery-county',
        params: {
            state: 'California',
            county: county,
            licensee: 'NEW CINGULAR WIRELESS PCS, LLC'
        },
        status: 'pending',
        maxAttempts: 3
    }));

    await prisma.jobQueue.createMany({ data: jobs });

    console.log('[SUCCESS] Re-seeding complete! Ready for worker execution.');
}

resetAndSeed()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
