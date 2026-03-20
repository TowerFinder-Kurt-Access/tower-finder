import { enqueueJob } from '../src/lib/job-queue';
import { prisma } from '../src/lib/prisma';

async function main() {
  const BATCH_SIZE = 50;
  const totalPhones = await prisma.phone.count({
    where: { status: { in: ['unknown', 'pending'] } }
  });

  console.log(`Total phones needing validation: ${totalPhones}`);

  if (totalPhones === 0) {
    console.log('No phones need validation.');
    return;
  }

  const jobsNeeded = Math.ceil(totalPhones / BATCH_SIZE);
  console.log(`Enqueuing ${jobsNeeded} jobs with batch size ${BATCH_SIZE}...`);

  for (let i = 0; i < jobsNeeded; i++) {
    await enqueueJob('validate_phone_numbers', { batchSize: BATCH_SIZE });
  }

  console.log('Successfully enqueued validation jobs.');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
