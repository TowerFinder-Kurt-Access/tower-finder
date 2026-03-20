import { prisma } from '../prisma';
import { PhoneValidationService } from '../../services/PhoneValidationService';

/**
 * Job handler to validate phone numbers across three levels:
 * 1. Format
 * 2. Active Status (API)
 * 3. Ring Verification (Simulation/Robocaller)
 */
export async function validatePhoneNumbers(params: { batchSize?: number } = {}) {
  const { batchSize = 10 } = params;

  // 1. Get phones that need validation
  const phones = await prisma.phone.findMany({
    where: {
      status: { in: ['unknown', 'pending'] }
    },
    take: batchSize,
    orderBy: { updatedAt: 'asc' }
  });

  if (phones.length === 0) {
    return { status: 'idle', processed: 0 };
  }

  console.log(`Processing ${phones.length} phones for multi-level validation...`);

  let processedCount = 0;

  for (const phone of phones) {
    try {
      // 2. Mark as processing
      await prisma.phone.update({
        where: { id: phone.id },
        data: { status: 'processing' }
      });

      // 3. Run multi-level validation
      const result = await PhoneValidationService.validateMultiLevel(phone.number);

      // 4. Handle Quota
      if (result.overallStatus === 'validation_throttled') {
        // Revert status to unknown so it can be retried tomorrow
        await prisma.phone.update({
          where: { id: phone.id },
          data: { status: 'unknown' }
        });
        throw new Error('Phone validation quota reached. Stopping batch.');
      }

      // 5. Create individual check records for each level attempted
      for (const levelRes of result.levels) {
        await prisma.phoneCheck.create({
          data: {
            phoneId: phone.id,
            apiName: levelRes.name,
            status: levelRes.status,
            rawResult: levelRes.raw as any
          }
        });
      }

      // 5. Update final summary status
      await prisma.phone.update({
        where: { id: phone.id },
        data: { 
          status: result.overallStatus
        }
      });

      processedCount++;
    } catch (error) {
      console.error(`Failed to validate phone ${phone.id}:`, error);
      // Revert status to unknown so it can be retried
      await prisma.phone.update({
        where: { id: phone.id },
        data: { status: 'unknown' }
      });
    }
  }

  const remainingCount = await prisma.phone.count({
    where: { status: { in: ['unknown', 'pending'] } }
  });

  if (remainingCount > 0) {
    console.log(`[Phone Validation Job] ${remainingCount} phones remaining. Enqueueing next batch...`);
    // Using import from job-queue inside handler would be circular if not careful, 
    // but typically handlers are separate.
    // However, in this project, handlers are often exported from job-handlers.ts.
    // Let's use the local Prisma to check and then return a status that might trigger next run, 
    // OR we can just call enqueueJob from '@/lib/job-queue'.
    const { enqueueJob } = await import('@/lib/job-queue');
    await enqueueJob('validate_phone_numbers', { batchSize });
  }

  return {
    status: 'completed',
    processed: processedCount,
    remainingPhones: remainingCount
  };
}
