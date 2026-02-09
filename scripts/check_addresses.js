const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('\n--- Sample Parcel Addresses ---');
    const parcels = await prisma.parcel.findMany({
        where: {
            address: { not: '' }
        },
        take: 10,
        select: { address: true }
    });
    console.table(parcels);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
