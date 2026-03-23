import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
  console.log('--- Starting Data Model Integration Tests ---');
  let towerId: number | null = null;

  try {
    // 1. Create a Tower with rawExcelData
    console.log('1. Testing Tower creation with rawExcelData...');
    const testData = { source_file: 'test.xlsx', row: 10, notes: 'Import test' };
    const tower = await prisma.tower.create({
      data: {
        lat: 45.0 + Math.random(),
        lon: -75.0 - Math.random(),
        rawImportData: testData,
        source: 'markslist'
      }
    });
    towerId = tower.id;
    console.log('   Success: Tower created with ID:', towerId);

    // 2. Create multiple Phone records for the Tower
    console.log('2. Testing multiple Phone records for a Tower...');
    const phoneData = [
      { number: '555-0101', status: 'active' },
      { number: '555-0102', status: 'inactive' },
      { number: '555-0103', status: 'unknown' }
    ];

    for (const p of phoneData) {
      await prisma.phone.create({
        data: {
          ...p,
          towerId: tower.id
        }
      });
    }

    const fetchedTower = await prisma.tower.findUnique({
      where: { id: tower.id },
      include: { phones: true }
    });

    if (fetchedTower?.phones.length === 3) {
      console.log('   Success: 3 Phone records verified for Tower.');
    } else {
      throw new Error(`Expected 3 phones, found ${fetchedTower?.phones.length}`);
    }

    // 3. Verify status updates on Phone records
    console.log('3. Testing Phone status updates and PhoneCheck creation...');
    const phoneToUpdate = fetchedTower.phones[0];
    
    // Update phone status
    await prisma.phone.update({
      where: { id: phoneToUpdate.id },
      data: { status: 'validated' }
    });

    // Create a phone check record
    const check = await prisma.phoneCheck.create({
      data: {
        phoneId: phoneToUpdate.id,
        apiName: 'test_api',
        status: 'valid',
        rawResult: { api_status: 'valid', timestamp: new Date().toISOString() }
      }
    });

    const updatedPhone = await prisma.phone.findUnique({
      where: { id: phoneToUpdate.id },
      include: { checks: true }
    });

    if (updatedPhone?.status === 'validated' && updatedPhone.checks.length === 1) {
      console.log('   Success: Phone status and PhoneCheck record verified.');
    } else {
      throw new Error(`Phone update verification failed. Status: ${updatedPhone?.status}, Checks: ${updatedPhone?.checks.length}`);
    }

    console.log('--- All Integration Tests Passed ---');

  } catch (error) {
    console.error('--- Integration Tests Failed ---');
    console.error(error);
    process.exit(1);
  } finally {
    if (towerId) {
      // Cleanup
      console.log('Cleaning up test data...');
      await prisma.tower.delete({ where: { id: towerId } });
      console.log('Cleanup complete.');
    }
    await prisma.$disconnect();
  }
}

runTests();
