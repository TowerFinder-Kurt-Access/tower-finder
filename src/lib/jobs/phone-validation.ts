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

      // 4. Create individual check records for each level attempted
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

  return {
    status: 'completed',
    processed: processedCount
  };
}
