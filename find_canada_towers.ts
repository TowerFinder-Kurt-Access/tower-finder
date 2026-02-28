import { prisma } from './src/lib/prisma';

async function test() {
    console.log('Searching for towers in Canada North (lat > 55)...');
    const towers = await prisma.tower.findMany({
        where: { lat: { gt: 55 } },
        take: 10
    });

    if (towers.length === 0) {
        console.log('No towers found in Canada North. Searching for towers in Canada (lat > 42, lon between -141 and -52)...');
        const canadaTowers = await prisma.tower.findMany({
            where: {
                lat: { gt: 42, lt: 85 },
                lon: { gt: -141, lt: -52 }
            },
            take: 10
        });
        console.log(`Found ${canadaTowers.length} towers in Canada range.`);
        canadaTowers.forEach(t => console.log(`Tower ${t.id}: ${t.lat}, ${t.lon}`));
    } else {
        console.log(`Found ${towers.length} high-latitude towers.`);
        towers.forEach(t => console.log(`Tower ${t.id}: ${t.lat}, ${t.lon}`));
    }
}

test().catch(console.error).finally(() => prisma.$disconnect());
