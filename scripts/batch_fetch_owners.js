/**
 * Batch fetch owner data for towers
 * This script fetches owner/parcel data for towers that don't have it yet
 * Prioritizes towers most likely to return valid owner data
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

// Configuration
const MAX_API_CALLS = 566; // Your remaining API calls
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const BATCH_SIZE = 10; // Process 10 towers at a time
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches

async function main() {
    console.log('========================================');
    console.log('Batch Owner Fetch Script');
    console.log('========================================');
    console.log(`Max API calls: ${MAX_API_CALLS}`);
    console.log(`API base URL: ${API_BASE_URL}`);
    console.log('');

    // Find towers without owner data, prioritizing those most likely to have data
    console.log('Finding towers without owner data...');

    const towersWithoutOwners = await prisma.tower.findMany({
        where: {
            OR: [
                { parcel: null }, // No parcel at all
                { parcel: { owner: null } }, // Has parcel but no owner
                { parcel: { owner: { name: 'UNKNOWN' } } }, // Owner is UNKNOWN
                { parcel: { owner: { name: 'Unknown' } } } // Owner is Unknown
            ]
        },
        include: {
            parcel: {
                include: {
                    owner: true
                }
            }
        },
        orderBy: [
            // Prioritize towers that have some parcel info (more likely to succeed)
            { parcel: { parcelId: 'asc' } },
            { id: 'asc' }
        ],
        take: MAX_API_CALLS // Only fetch what we can process
    });

    console.log(`Found ${towersWithoutOwners.length} towers without complete owner data`);

    if (towersWithoutOwners.length === 0) {
        console.log('No towers need owner data. Exiting.');
        return;
    }

    // Process in batches
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;
    let noDataCount = 0;

    console.log('');
    console.log('Starting batch processing...');
    console.log('');

    for (let i = 0; i < towersWithoutOwners.length; i += BATCH_SIZE) {
        const batch = towersWithoutOwners.slice(i, i + BATCH_SIZE);

        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(towersWithoutOwners.length / BATCH_SIZE)} (Towers ${i + 1}-${Math.min(i + BATCH_SIZE, towersWithoutOwners.length)})`);

        // Process batch in parallel
        const results = await Promise.allSettled(
            batch.map(tower => fetchAndSaveOwner(tower))
        );

        // Tally results
        results.forEach((result, index) => {
            processedCount++;
            const tower = batch[index];

            if (result.status === 'fulfilled') {
                if (result.value === 'success') {
                    successCount++;
                    console.log(`  ✓ Tower ${tower.id}: Owner data saved`);
                } else if (result.value === 'no_data') {
                    noDataCount++;
                    console.log(`  ○ Tower ${tower.id}: No owner data available`);
                } else {
                    failCount++;
                    console.log(`  ✗ Tower ${tower.id}: ${result.value}`);
                }
            } else {
                failCount++;
                console.log(`  ✗ Tower ${tower.id}: ${result.reason}`);
            }
        });

        console.log('');

        // Wait between batches to avoid overwhelming the API
        if (i + BATCH_SIZE < towersWithoutOwners.length) {
            await sleep(DELAY_BETWEEN_BATCHES);
        }
    }

    // Summary
    console.log('========================================');
    console.log('Batch Processing Complete');
    console.log('========================================');
    console.log(`Total processed: ${processedCount}`);
    console.log(`Successful: ${successCount}`);
    console.log(`No data available: ${noDataCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`API calls remaining: ~${MAX_API_CALLS - processedCount}`);
    console.log('');
}

async function fetchAndSaveOwner(tower) {
    try {
        // Call the owner API endpoint
        const response = await axios.get(`${API_BASE_URL}/api/owner`, {
            params: {
                lat: tower.lat,
                lon: tower.lon
            },
            timeout: 30000 // 30 second timeout
        });

        // Check if we got data
        if (!response.data.result || !response.data.result._parcel) {
            return 'no_data';
        }

        // The API already saves the data to the database through InformationService
        // So we just need to verify it succeeded
        const ownerName = response.data.result.owner || 'Unknown';

        return 'success';

    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 404) {
                return 'no_data';
            }
            return `API error: ${error.response?.status || error.message}`;
        }
        return `Error: ${error.message}`;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the script
main()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
