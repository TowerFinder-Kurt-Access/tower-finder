const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportTowersForSupport() {
  console.log('========================================');
  console.log('Exporting Locations for Support');
  console.log('========================================\n');

  try {
    // Fetch all towers with parcel and owner data
    console.log('Fetching all locations from database...');
    const towers = await prisma.tower.findMany({
      include: {
        parcel: {
          include: {
            owner: true
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    });

    console.log(`Found ${towers.length} locations\n`);

    // Transform data for export
    const exportData = towers.map(tower => ({
      locationId: tower.id,
      coordinates: {
        latitude: tower.lat,
        longitude: tower.lon
      },
      parcelId: tower.parcel?.parcelId || null,
      address: tower.parcel?.address || null,
      city: tower.parcel?.city || null,
      state: tower.parcel?.state || null,
      zip: tower.parcel?.zip || null,
      owner: {
        name: tower.parcel?.owner?.name || 'UNKNOWN',
        address: tower.parcel?.owner?.address || null
      },
      dataSource: tower.parcel?.dataSource || null,
      hasOwnerData: tower.parcel?.owner?.name && tower.parcel.owner.name !== 'UNKNOWN'
    }));

    // Calculate statistics
    const stats = {
      total: exportData.length,
      withOwnerData: exportData.filter(t => t.hasOwnerData).length,
      withoutOwnerData: exportData.filter(t => !t.hasOwnerData).length,
      withParcelId: exportData.filter(t => t.parcelId).length,
      withoutParcelId: exportData.filter(t => !t.parcelId).length
    };

    // Create export object
    const exportObject = {
      exportDate: new Date().toISOString(),
      summary: stats,
      locations: exportData
    };

    // Save to JSON file
    const outputPath = path.join(__dirname, '..', 'locations_export_for_support.json');
    fs.writeFileSync(outputPath, JSON.stringify(exportObject, null, 2));

    console.log('Export Statistics:');
    console.log('─────────────────────────────────────');
    console.log(`Total Locations:        ${stats.total}`);
    console.log(`With Owner Data:        ${stats.withOwnerData}`);
    console.log(`Without Owner Data:     ${stats.withoutOwnerData}`);
    console.log(`With Parcel ID:         ${stats.withParcelId}`);
    console.log(`Without Parcel ID:      ${stats.withoutParcelId}`);
    console.log('─────────────────────────────────────\n');

    console.log(`✓ Export saved to: ${outputPath}`);
    console.log(`✓ File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB\n`);

    // Create a file with only locations that have an owner record but name is UNKNOWN
    // (These are locations where API was called but returned UNKNOWN)
    const unknownsWithOwnerRecord = exportData.filter(t =>
      t.owner.name === 'UNKNOWN' && t.parcelId !== null
    );

    const unknownsOnly = {
      exportDate: new Date().toISOString(),
      summary: {
        total: unknownsWithOwnerRecord.length,
        note: 'This file contains only locations where the API returned UNKNOWN owner data'
      },
      locations: unknownsWithOwnerRecord
    };

    const unknownsPath = path.join(__dirname, '..', 'locations_unknowns_for_support.json');
    fs.writeFileSync(unknownsPath, JSON.stringify(unknownsOnly, null, 2));

    console.log(`✓ Unknowns-only export saved to: ${unknownsPath}`);
    console.log(`✓ File size: ${(fs.statSync(unknownsPath).size / 1024).toFixed(2)} KB`);
    console.log(`✓ Contains ${unknownsWithOwnerRecord.length} locations where API returned UNKNOWN\n`);

    console.log('========================================');
    console.log('Export Complete');
    console.log('========================================');

  } catch (error) {
    console.error('Error exporting locations:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

exportTowersForSupport()
  .catch(console.error);
