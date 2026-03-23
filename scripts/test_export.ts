import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { ExportService } from '../src/services/ExportService';
import * as xlsx from 'xlsx';
import * as fs from 'fs';

async function testExport() {
  console.log('--- Testing Export Service ---');
  let towerId: number | null = null;

  try {
    // 1. Create a dummy tower with rawImportData and notes
    console.log('1. Creating test tower...');
    const testRawData = { 'Tower Name': 'Test Tower 1', 'Owner': 'Test Owner', 'Height': 100 };
    
    // Create a dummy user for the note
    const user = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password'
      }
    });

    const tower = await prisma.tower.create({
      data: {
        lat: 40.7128 + Math.random(),
        lon: -74.0060 - Math.random(),
        rawImportData: testRawData,
        source: 'export-test',
        notes: {
          create: [
            { content: 'System note', initials: 'SY', authorId: user.id },
            { content: 'Imported note', initials: 'IM' } // No authorId = imported
          ]
        }
      },
      include: { notes: true }
    });
    towerId = tower.id;
    console.log(`   Success: Tower created with ID: ${towerId}`);

    // 2. Run export for this specific tower
    console.log('2. Running export for the test tower...');
    const buffer = await ExportService.exportTowersToExcel([tower.id]);
    
    // 3. Verify the Excel content
    console.log('3. Verifying Excel content...');
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[] = xlsx.utils.sheet_to_json(sheet);

    if (data.length !== 1) {
      throw new Error(`Expected 1 row, found ${data.length}`);
    }

    const row = data[0];
    console.log('   Row data:', row);

    if (row['Tower Name'] !== 'Test Tower 1') {
      throw new Error(`Incorrect Tower Name: ${row['Tower Name']}`);
    }

    if (!row['System Notes'] || !row['System Notes'].includes('System note')) {
      throw new Error(`System Note missing: ${row['System Notes']}`);
    }

    if (row['System Notes'].includes('Imported note')) {
      throw new Error(`Imported Note should be filtered out: ${row['System Notes']}`);
    }

    console.log('   Success: Imported notes correctly filtered out!');
    console.log('--- All Export Service Tests Passed ---');

  } catch (error) {
    console.error('--- Export Service Tests Failed ---');
    console.error(error);
    process.exit(1);
  } finally {
    if (towerId) {
      console.log('Cleaning up test data...');
      await prisma.tower.delete({ where: { id: towerId } });
      if (fs.existsSync('test_export_output.xlsx')) {
        fs.unlinkSync('test_export_output.xlsx');
      }
      console.log('Cleanup complete.');
    }
    await prisma.$disconnect();
  }
}

testExport();
