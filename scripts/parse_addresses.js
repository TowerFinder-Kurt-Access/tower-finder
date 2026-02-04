/**
 * Parse and fix addresses in the database
 * Extracts city, state/province, and zip/postal code from full addresses
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Canadian provinces and abbreviations
const CANADIAN_PROVINCES = {
    'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba',
    'NB': 'New Brunswick', 'NL': 'Newfoundland and Labrador', 'NT': 'Northwest Territories',
    'NS': 'Nova Scotia', 'NU': 'Nunavut', 'ON': 'Ontario',
    'PE': 'Prince Edward Island', 'QC': 'Quebec', 'SK': 'Saskatchewan', 'YT': 'Yukon'
};

// US states (common abbreviations)
const US_STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire',
    'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina',
    'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
    'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee',
    'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
    'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
};

const ALL_STATES = { ...CANADIAN_PROVINCES, ...US_STATES };

function parseAddress(fullAddress) {
    if (!fullAddress || typeof fullAddress !== 'string') {
        return { city: null, state: null, zip: null };
    }

    const address = fullAddress.trim();

    // Pattern 1: "City, Province/State Postal/Zip"
    // Example: "Halifax, NS B3H 1A6" or "New York, NY 10001"
    const pattern1 = /,\s*([A-Z]{2})\s+([A-Z0-9\s-]+)$/i;
    const match1 = address.match(pattern1);

    if (match1) {
        const stateCode = match1[1].toUpperCase();
        const zipCode = match1[2].trim();

        // Extract city (everything before the last comma)
        const cityPart = address.substring(0, address.lastIndexOf(',')).trim();
        // Remove street address if present (take last part after comma or use whole thing)
        const cityMatch = cityPart.match(/(?:,\s*)?([^,]+)$/);
        const city = cityMatch ? cityMatch[1].trim() : cityPart;

        if (ALL_STATES[stateCode]) {
            return {
                city,
                state: stateCode,
                zip: zipCode
            };
        }
    }

    // Pattern 2: "City Province/State Postal/Zip" (no comma)
    // Example: "Halifax NS B3H 1A6"
    const pattern2 = /\s([A-Z]{2})\s+([A-Z0-9\s-]+)$/i;
    const match2 = address.match(pattern2);

    if (match2) {
        const stateCode = match2[1].toUpperCase();
        const zipCode = match2[2].trim();

        // Extract city (everything before state)
        const cityPart = address.substring(0, match2.index).trim();
        const cityMatch = cityPart.match(/(?:,\s*)?([^,]+)$/);
        const city = cityMatch ? cityMatch[1].trim() : cityPart;

        if (ALL_STATES[stateCode]) {
            return {
                city,
                state: stateCode,
                zip: zipCode
            };
        }
    }

    // Pattern 3: Just look for province/state code and zip at the end
    const pattern3 = /([A-Z]{2})\s*([A-Z0-9\s-]+)$/i;
    const match3 = address.match(pattern3);

    if (match3) {
        const stateCode = match3[1].toUpperCase();
        const zipCode = match3[2].trim();

        if (ALL_STATES[stateCode]) {
            return {
                city: null,
                state: stateCode,
                zip: zipCode
            };
        }
    }

    return { city: null, state: null, zip: null };
}

async function main() {
    console.log('========================================');
    console.log('Address Parser Script');
    console.log('========================================\n');

    // Get all parcels with addresses
    const parcels = await prisma.parcel.findMany({
        where: {
            address: {
                not: null
            }
        }
    });

    console.log(`Found ${parcels.length} parcels with addresses\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const parcel of parcels) {
        try {
            // Skip if already has city, state, and zip
            if (parcel.city && parcel.state && parcel.zip) {
                skippedCount++;
                continue;
            }

            const parsed = parseAddress(parcel.address);

            // Only update if we extracted something useful
            if (parsed.city || parsed.state || parsed.zip) {
                await prisma.parcel.update({
                    where: { id: parcel.id },
                    data: {
                        city: parsed.city || parcel.city,
                        state: parsed.state || parcel.state,
                        zip: parsed.zip || parcel.zip
                    }
                });

                updatedCount++;

                if (updatedCount % 100 === 0) {
                    console.log(`Processed ${updatedCount} parcels...`);
                }
            } else {
                skippedCount++;
            }
        } catch (error) {
            errorCount++;
            console.error(`Error processing parcel ${parcel.id}:`, error.message);
        }
    }

    console.log('\n========================================');
    console.log('Parsing Complete');
    console.log('========================================');
    console.log(`Total parcels: ${parcels.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already complete): ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('');
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
