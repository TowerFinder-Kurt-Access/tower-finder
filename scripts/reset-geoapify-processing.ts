// Clears Tower.placesProcessedAt so the next Geoapify batch re-detects nearby businesses.
// npx tsx --env-file=.env scripts/reset-geoapify-processing.ts [--tower <id>]
import { prisma } from '../src/lib/prisma';

async function main() {
  const towerFlag = process.argv.indexOf('--tower');
  const towerId = towerFlag === -1 ? null : Number(process.argv[towerFlag + 1]);

  if (towerId !== null && !Number.isInteger(towerId)) {
    throw new Error('--tower needs a numeric tower id');
  }

  const { count } = await prisma.tower.updateMany({
    where: towerId === null ? { placesProcessedAt: { not: null } } : { id: towerId },
    data: { placesProcessedAt: null }
  });

  console.log(`Reset ${count} tower(s). Trigger the Geoapify job to rebuild nearby businesses.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
