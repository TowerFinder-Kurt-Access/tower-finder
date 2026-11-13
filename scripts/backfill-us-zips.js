// Fills the ZIP on USA parcels that have coordinates but no ZIP, using the Census
// ZCTA layer. A point outside every ZCTA keeps a null ZIP rather than a guess.
//
// Usage:
//   node scripts/backfill-us-zips.js            # preview
//   node scripts/backfill-us-zips.js --write    # persist
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');
const ZCTA_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query';
const RETRIES = 3;

/** The ZCTA that contains a point, or null when it sits outside every one. */
async function zipFor(lat, lon) {
    const url = `${ZCTA_URL}?f=json`
        + `&geometry=${encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }))}`
        + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
        + '&outFields=ZCTA5&returnGeometry=false';
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (payload.error) throw new Error(payload.error.message || 'TIGERweb error');
            const zip = payload.features?.[0]?.attributes?.ZCTA5;
            return zip ? String(zip).trim() : null;
        } catch (error) {
            if (attempt === RETRIES) throw error;
            await new Promise((resolve) => { setTimeout(resolve, attempt * 500); });
        }
    }
    return null;
}

(async () => {
    const parcels = await prisma.$queryRaw`
        SELECT t.id AS "towerId", t.lat, t.lon, p.id AS "parcelId", p."cityRaw", p."stateRaw"
        FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA' AND p.zip IS NULL
        ORDER BY t.id
    `;
    console.log(`parcels without a ZIP: ${parcels.length}`);

    let filled = 0;
    const unresolved = [];
    for (const parcel of parcels) {
        const zip = await zipFor(parcel.lat, parcel.lon);
        if (!zip) {
            unresolved.push(parcel);
            console.log(`  tower ${parcel.towerId} (${parcel.cityRaw}, ${parcel.stateRaw}): no ZCTA at this point`);
            continue;
        }
        filled += 1;
        console.log(`  tower ${parcel.towerId} (${parcel.cityRaw}, ${parcel.stateRaw}): ${zip}`);
        if (WRITE) {
            await prisma.$executeRaw`UPDATE "Parcel" SET zip = ${zip} WHERE id = ${parcel.parcelId}`;
        }
    }

    console.log(`\nresolved: ${filled}, unresolved: ${unresolved.length}`);
    if (!WRITE) console.log('Dry run. Re-run with --write to persist.');
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
