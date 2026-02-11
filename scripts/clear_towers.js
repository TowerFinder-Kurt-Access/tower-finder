const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Clearing Tower-related data to prepare for migration...');

    // Delete in order of dependency
    await prisma.towerAssignment.deleteMany({});
    console.log('Deleted TowerAssignments');

    await prisma.note.deleteMany({});
    console.log('Deleted Notes');

    await prisma.parcel.deleteMany({});
    console.log('Deleted Parcels');

    // Tower is the main table
    await prisma.tower.deleteMany({});
    console.log('Deleted Towers');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
