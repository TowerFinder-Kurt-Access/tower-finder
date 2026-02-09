const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Tower Sources ---');
    const sources = await prisma.tower.groupBy({
        by: ['source'],
        _count: { id: true },
    });
    console.table(sources);

    console.log('\n--- Parcel States ---');
    const states = await prisma.parcel.groupBy({
        by: ['state'],
        _count: { id: true },
    });
    console.table(states);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
