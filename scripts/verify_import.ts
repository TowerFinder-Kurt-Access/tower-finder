import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const towers = await prisma.tower.findMany({
    where: { source: 'markslist' },
    include: {
      _count: {
        select: {
          phones: true,
          notes: true
        }
      }
    },
    take: 5
  });

  const totalTowers = await prisma.tower.count({ where: { source: 'markslist' } });
  const totalPhones = await prisma.phone.count({ where: { tower: { source: 'markslist' } } });
  const totalNotes = await prisma.note.count({ where: { tower: { source: 'markslist' } } });

  console.log('--- Import Verification ---');
  console.log(`Total Towers: ${totalTowers}`);
  console.log(`Total Phones: ${totalPhones}`);
  console.log(`Total Notes:  ${totalNotes}`);
  console.log('\nSample Towers:');
  towers.forEach(t => {
    console.log(`Tower #${t.id}: Phones: ${t._count.phones}, Notes: ${t._count.notes}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
