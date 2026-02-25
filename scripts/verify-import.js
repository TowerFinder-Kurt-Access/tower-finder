const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const sampleNotes = await prisma.note.findMany({
        take: 5,
        orderBy: { id: 'desc' },
        include: { tower: { select: { lat: true, lon: true, legacyStatus: true } } }
    });

    console.log('Sample Recently Added Notes:', JSON.stringify(sampleNotes, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
