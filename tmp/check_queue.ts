import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkQueue() {
    const jobs = await prisma.jobQueue.groupBy({
        by: ['jobType', 'status'],
        _count: { _all: true }
    });
    console.log('[QUEUE-STATUS]', JSON.stringify(jobs, null, 2));
}

checkQueue()
    .finally(async () => await prisma.$disconnect());
