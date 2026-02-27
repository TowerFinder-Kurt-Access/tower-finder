import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const jobs = await prisma.jobQueue.findMany({
        where: { jobType: 'poll_geoapify_batch' },
        orderBy: { createdAt: 'desc' },
        take: 3
    });
    console.log("==== RECENT POLL JOBS ====");
    console.log(JSON.stringify(jobs, null, 2));

    const businesses = await prisma.businessNearby.count();
    console.log(`\nTotal Route/BusinessNearby count: ${businesses}`);

    const processedTowers = await prisma.tower.count({
        where: { placesProcessedAt: { not: null } }
    });
    console.log(`Towers processed: ${processedTowers}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
