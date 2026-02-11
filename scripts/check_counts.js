const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const towerCount = await prisma.tower.count();
    const parcelCount = await prisma.parcel.count();
    const odaCount = await prisma.odaAddress.count();

    console.log(`Towers: ${towerCount}`);
    console.log(`Parcels: ${parcelCount}`);
    console.log(`ODA Addresses: ${odaCount}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
