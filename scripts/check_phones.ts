import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const towerCount = await prisma.tower.count({
    where: { source: 'markslist' }
  });
  console.log(`Total towers from markslist: ${towerCount}`);

  const towersWithPhones = await prisma.tower.count({
    where: {
      source: 'markslist',
      phones: { some: {} }
    }
  });
  console.log(`Towers from markslist with at least one phone: ${towersWithPhones}`);

  const phoneCount = await prisma.phone.count({
    where: {
      tower: { source: 'markslist' }
    }
  });
  console.log(`Total phones for markslist towers: ${phoneCount}`);

  if (phoneCount > 0) {
    const samplePhones = await prisma.phone.findMany({
      where: {
        tower: { source: 'markslist' }
      },
      take: 5,
      include: {
        tower: true
      }
    });
    console.log('Sample phones:', JSON.stringify(samplePhones, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
