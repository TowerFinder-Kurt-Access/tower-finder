const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const towers = await prisma.tower.findMany({ take: 1 });
    console.log('Tower columns:', Object.keys(towers[0] || {}));
    if (towers.length > 0) {
      console.log('Sample rawExcelData:', towers[0].rawExcelData);
    }
  } catch (e) {
    console.error('Error fetching towers:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
