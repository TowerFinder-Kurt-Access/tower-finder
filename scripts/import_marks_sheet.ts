import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();
const EXCEL_PATH = 'sources/Marks Sheet new towers only 20260305.xlsx';

function extractPhones(phoneString: string | undefined): string[] {
  if (!phoneString) return [];
  
  const phoneRegex = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g;
  const matches = phoneString.match(phoneRegex);
  
  if (!matches) return [];

  const uniquePhones = new Set<string>();
  
  matches.forEach(m => {
    let digits = m.replace(/[^\d]/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.substring(1);
    }
    if (digits.length > 10) {
      digits = digits.substring(digits.length - 10);
    }
    if (digits.length === 10) {
      uniquePhones.add(digits);
    }
  });

  return Array.from(uniquePhones);
}

async function main() {
  console.log('--- Starting Marks Sheet Import ---');
  
  try {
    const workbook = xlsx.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    if (data.length < 2) {
      console.log('No data found in sheet.');
      return;
    }

    const headers = data[0];
    const rows = data.slice(1);

    console.log(`Found ${rows.length} rows to process.`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) {
        console.log(`Row ${i + 2}: Empty row. Skipping.`);
        continue;
      }

      try {
        const rowData: any = {};
        headers.forEach((header, index) => {
          if (header) rowData[header] = row[index];
        });

        const lat = parseFloat(rowData['Latitude']);
        const lon = parseFloat(rowData['Longitude']);

        if (isNaN(lat) || isNaN(lon)) {
          console.warn(`Row ${i + 2}: Invalid coordinates (Lat: ${rowData['Latitude']}, Lon: ${rowData['Longitude']}). Skipping.`);
          errorCount++;
          continue;
        }

        const ownerName = rowData['Owner'] || 'Unknown Owner';
        const carrierName = rowData['TowerOwner'] || rowData['Steel Ownr'];

        // 1. Find or create Carrier
        let carrierId: number | undefined = undefined;
        if (carrierName) {
          const carrier = await prisma.carrier.upsert({
            where: { id: -1 }, // Use an ID that won't exist to force find by name if we had unique name, but we don't
            // Actually, we should probably find by name first
            create: { name: carrierName },
            update: {}
          });
          // Note: Prisma Carrier model doesn't have a unique name field in schema.prisma
          // Let's find by name first to avoid duplicates if possible, or just accept it for now
          const existingCarrier = await prisma.carrier.findFirst({ where: { name: carrierName } });
          if (existingCarrier) {
            carrierId = existingCarrier.id;
          } else {
            const newCarrier = await prisma.carrier.create({ data: { name: carrierName } });
            carrierId = newCarrier.id;
          }
        }

        // 2. Upsert Tower
        const tower = await prisma.tower.upsert({
          where: { lat_lon: { lat, lon } },
          update: {
            businessName: rowData['Sitename'],
            remarks: rowData['Location'],
            source: 'markslist',
            rawExcelData: rowData,
            carrierId: carrierId
          },
          create: {
            lat,
            lon,
            businessName: rowData['Sitename'],
            remarks: rowData['Location'],
            source: 'markslist',
            rawExcelData: rowData,
            carrierId: carrierId
          }
        });

        // 3. Create/Update Owner
        const owner = await prisma.owner.create({
          data: {
            name: ownerName,
            address: rowData['Address Ownr']
          }
        });

        // 4. Create/Update Parcel
        await prisma.parcel.upsert({
          where: { towerId: tower.id },
          update: {
            parcelId: rowData['Parcel ID'],
            cityRaw: rowData['City'],
            stateRaw: rowData['State'],
            zip: rowData['Zipcode']?.toString(),
            county: rowData['County'],
            country: 'USA',
            ownerId: owner.id
          },
          create: {
            towerId: tower.id,
            parcelId: rowData['Parcel ID'],
            cityRaw: rowData['City'],
            stateRaw: rowData['State'],
            zip: rowData['Zipcode']?.toString(),
            county: rowData['County'],
            country: 'USA',
            ownerId: owner.id
          }
        });

        // 5. Handle Phone Numbers
        const phoneString = rowData['Phone'];
        const extractedPhones = extractPhones(phoneString);
        
        // Delete existing phones for this tower if we want to refresh them
        await prisma.phone.deleteMany({ where: { towerId: tower.id } });

        for (const phoneNumber of extractedPhones) {
          await prisma.phone.create({
            data: {
              number: phoneNumber,
              status: 'unknown',
              towerId: tower.id
            }
          });
        }

        successCount++;
        if (successCount % 10 === 0) {
          console.log(`Processed ${successCount} rows...`);
        }

      } catch (rowError) {
        console.error(`Error processing row ${i + 2}:`, rowError);
        errorCount++;
      }
    }

    console.log(`--- Import Finished ---`);
    console.log(`Successfully imported: ${successCount}`);
    console.log(`Errors encountered: ${errorCount}`);

  } catch (error) {
    console.error('Fatal error during import:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
