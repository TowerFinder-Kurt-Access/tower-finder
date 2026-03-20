import { prisma } from '../prisma';
import { PhoneValidationService } from '../../services/PhoneValidationService';

/**
 * Job handler to validate phone numbers using all configured providers.
 * Processes a batch of 'unknown' or 'pending' phone numbers.
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

  console.log(`Processing ${phones.length} phones for validation...`);

  let processedCount = 0;

  for (const phone of phones) {
    try {
      // 2. Mark as processing
      await prisma.phone.update({
        where: { id: phone.id },
        data: { status: 'processing' }
      });

      // 3. Run validation across all providers
      const results = await PhoneValidationService.validateWithAll(phone.number);

      // 4. Create individual check records
      for (const res of results) {
        await prisma.phoneCheck.create({
          data: {
            phoneId: phone.id,
            apiName: res.provider,
            status: res.valid ? 'valid' : 'invalid',
            rawResult: res.raw as any
          }
        });
      }

      // 5. Update summary status
      // Simple logic: if any API says it's valid, it's active.
      const isAnyValid = results.some(r => r.valid);
      
      await prisma.phone.update({
        where: { id: phone.id },
        data: { 
          status: isAnyValid ? 'active' : 'inactive'
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
