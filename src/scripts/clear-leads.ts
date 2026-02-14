
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Clearing all TowerLead records...');
    try {
        const { count } = await prisma.towerLead.deleteMany({});
        console.log(`Deleted ${count} TowerLead records.`);

        // Also clear LeadSearch history so users can re-search freely
        const searchDelete = await prisma.leadSearch.deleteMany({});
        console.log(`Deleted ${searchDelete.count} LeadSearch records.`);

    } catch (error) {
        console.error('Error clearing leads:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
