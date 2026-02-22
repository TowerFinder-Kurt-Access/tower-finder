const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Migrating statuses...');
  const towers = await prisma.tower.findMany({
    select: { id: true, legacyStatus: true, statusId: true }
  });

  const uniqueStatuses = new Set(
    towers
      .map(t => t.legacyStatus)
      .filter(s => s != null && s !== '')
  );

  console.log(`Found ${uniqueStatuses.size} unique statuses.`);

  // Create statuses
  const statusMap = new Map();
  for (const statusName of uniqueStatuses) {
    const s = await prisma.towerStatus.upsert({
      where: { name: statusName },
      update: {},
      create: { name: statusName }
    });
    statusMap.set(statusName, s.id);
    console.log(`Ensured status exists: ${statusName} (ID: ${s.id})`);
  }

  // Update towers
  let updatedCount = 0;
  for (const tower of towers) {
    if (tower.legacyStatus && tower.statusId == null) {
      const sId = statusMap.get(tower.legacyStatus);
      if (sId) {
        await prisma.tower.update({
          where: { id: tower.id },
          data: { statusId: sId }
        });
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} towers to use status relation.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
