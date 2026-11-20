// Fills the blank location columns on US towers that have no Parcel row.
//
// Most US towers came from promoted OpenStreetMap leads, so they have
// coordinates but no parcel, and every location column reads empty in the
// towers list. This script reverse-geocodes each point against the Census
// TIGERweb service (free, no API key) and creates the missing Parcel row.
//
// Usage:
//   node scripts/enrich-us-parcels.js --limit 50            # preview 50 rows
//   node scripts/enrich-us-parcels.js --write               # persist every row
//   node scripts/enrich-us-parcels.js --self-check          # offline unit checks
//
// Re-runnable: a tower is skipped once its parcel holds all four fields.
require('dotenv').config({ quiet: true });
const assert = require('node:assert');
const { PrismaClient, Prisma } = require('@prisma/client');

const WRITE = process.argv.includes('--write');
const TAGS_ONLY = process.argv.includes('--tags-only');
const NORMALIZE = process.argv.includes('--normalize');
const SELF_CHECK = process.argv.includes('--self-check');
const LIMIT_ARG = process.argv.indexOf('--limit');
const LIMIT = LIMIT_ARG > -1 ? Number(process.argv[LIMIT_ARG + 1]) : null;
const CONCURRENCY = 8;
const RETRIES = 3;
const USA_BBOX = { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };

// TIGERweb layers. One point per request: the multipoint form returns a flat
// feature list with no point identity, so it cannot be mapped back to a tower.
const TIGER = {
    zcta: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query',
    county: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query',
    place: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query',
    cdp: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/5/query',
};

// State FIPS code to USPS abbreviation. TIGERweb reports the FIPS code, and
// the towers list filters on the abbreviation.
const FIPS_TO_STATE = {
    '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
    10: 'DE', 11: 'DC', 12: 'FL', 13: 'GA', 15: 'HI', 16: 'ID', 17: 'IL', 18: 'IN',
    19: 'IA', 20: 'KS', 21: 'KY', 22: 'LA', 23: 'ME', 24: 'MD', 25: 'MA', 26: 'MI',
    27: 'MN', 28: 'MS', 29: 'MO', 30: 'MT', 31: 'NE', 32: 'NV', 33: 'NH', 34: 'NJ',
    35: 'NM', 36: 'NY', 37: 'NC', 38: 'ND', 39: 'OH', 40: 'OK', 41: 'OR', 42: 'PA',
    44: 'RI', 45: 'SC', 46: 'SD', 47: 'TN', 48: 'TX', 49: 'UT', 50: 'VT', 51: 'VA',
    53: 'WA', 54: 'WV', 55: 'WI', 56: 'WY', 60: 'AS', 66: 'GU', 69: 'MP', 72: 'PR',
    78: 'VI',
};

/** Census returns "Lakewood city", "Harris County"; the list shows the bare name. */
const barePlace = (name) => String(name ?? '')
    // Consolidated city-county names carry a "(balance)" suffix.
    .replace(/\s*\((balance|remainder)\)\s*$/i, '')
    .replace(/\s+(metropolitan government|metro government|unified government)$/i, '')
    // "Louisville/Jefferson County metro government" leaves both halves behind.
    .replace(/\/[^/]*$/, '')
    .replace(/\s+(city|town|village|borough|township|CDP|community|municipality)$/i, '')
    .replace(/\s+(County|Parish|Borough|Census Area|Municipio)$/i, '')
    .trim();

/** `county` and `cityRaw` store lower case on the existing US parcels. */
const lowerName = (value) => {
    const bare = barePlace(value);
    return bare ? bare.toLowerCase() : null;
};

const inUsaBbox = (lat, lon) => lat >= USA_BBOX.minLat && lat <= USA_BBOX.maxLat
    && lon >= USA_BBOX.minLon && lon <= USA_BBOX.maxLon;

/**
 * Builds the address text from the parts that are actually known. Most towers
 * sit outside any incorporated place, so the county stands in for the city.
 */
const composeAddress = ({ streetNumber, streetName, city, county, state, zip }) => {
    const localityName = city || county;
    if (!localityName) return null;
    const street = [streetNumber, streetName].filter(Boolean).join(' ');
    const tail = [localityName, state].filter(Boolean).join(', ');
    const locality = [tail, zip].filter(Boolean).join(' ');
    return [street, locality].filter(Boolean).join(', ') || null;
};

const queryUrl = (endpoint, lat, lon, outFields) => `${endpoint}?f=json`
    + `&geometry=${encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }))}`
    + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
    + `&outFields=${outFields}&returnGeometry=false`;

async function fetchFeatures(url) {
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (payload.error) throw new Error(payload.error.message || 'TIGERweb error');
            return Array.isArray(payload.features) ? payload.features.map((f) => f.attributes) : [];
        } catch (error) {
            if (attempt === RETRIES) throw error;
            await new Promise((resolve) => { setTimeout(resolve, attempt * 500); });
        }
    }
    return [];
}

/** Reverse-geocodes one point into the fields the towers list reads. */
async function lookupLocation(lat, lon) {
    const [zctas, counties, places, cdps] = await Promise.all([
        fetchFeatures(queryUrl(TIGER.zcta, lat, lon, 'ZCTA5')),
        fetchFeatures(queryUrl(TIGER.county, lat, lon, 'NAME,STATE')),
        fetchFeatures(queryUrl(TIGER.place, lat, lon, 'BASENAME,STATE')),
        fetchFeatures(queryUrl(TIGER.cdp, lat, lon, 'BASENAME,STATE')),
    ]);

    const county = counties[0] || null;
    const stateCode = county?.STATE ? FIPS_TO_STATE[county.STATE] ?? null : null;
    // A point can sit in a city and a CDP; the incorporated place wins.
    const place = places[0] || cdps[0] || null;

    return {
        stateCode,
        county: lowerName(county?.NAME),
        city: lowerName(place?.BASENAME || place?.NAME),
        zip: zctas[0]?.ZCTA5 ?? null,
    };
}

/** City and state recorded in the tower's own OSM or FAA tags, when present. */
const tagsToLocation = (tags) => {
    const data = tags && typeof tags === 'object' ? tags : {};
    const city = data['addr:city'] ?? data.CITY ?? null;
    const state = data['addr:state'] ?? data.STATE ?? null;
    return {
        city: city ? String(city).toLowerCase().trim() : null,
        stateCode: state && /^[A-Z]{2}$/.test(String(state).trim()) ? String(state).trim() : null,
        zip: data['addr:postcode'] ? String(data['addr:postcode']).trim() : null,
        street: data['addr:street']
            ? [data['addr:housenumber'], data['addr:street']].filter(Boolean).join(' ').trim()
            : null,
    };
};

const runSelfCheck = () => {
    assert.strictEqual(barePlace('Lakewood city'), 'Lakewood');
    assert.strictEqual(barePlace('Harris County'), 'Harris');
    assert.strictEqual(barePlace('Ness County'), 'Ness');
    assert.strictEqual(barePlace('Anchorage Municipality'), 'Anchorage');
    assert.strictEqual(barePlace('Indianapolis city (balance)'), 'Indianapolis');
    assert.strictEqual(barePlace('Louisville/Jefferson County metro government (balance)'), 'Louisville');
    assert.strictEqual(barePlace('Nashville-Davidson metropolitan government (balance)'), 'Nashville-Davidson');
    assert.strictEqual(barePlace('Urban Honolulu CDP'), 'Urban Honolulu');
    assert.strictEqual(lowerName('York County'), 'york');
    assert.strictEqual(lowerName(null), null);
    assert.strictEqual(FIPS_TO_STATE['08'], 'CO');
    assert.strictEqual(FIPS_TO_STATE['48'], 'TX');
    assert.strictEqual(
        composeAddress({ streetNumber: '900', streetName: 'Bagby St', city: 'houston', state: 'TX', zip: '77002' }),
        '900 Bagby St, houston, TX 77002',
    );
    assert.strictEqual(composeAddress({ city: 'lakewood', state: 'CO', zip: '80228' }), 'lakewood, CO 80228');
    assert.strictEqual(composeAddress({}), null);
    // A state and ZIP with no city falls back to the county.
    assert.strictEqual(composeAddress({ county: 'moffat', state: 'CO', zip: '81640' }), 'moffat, CO 81640');
    // Neither city nor county is not an address.
    assert.strictEqual(composeAddress({ state: 'CO', zip: '81640' }), null);
    assert.strictEqual(inUsaBbox(29.76, -95.36), true);
    assert.strictEqual(inUsaBbox(51, -95.36), false);
    assert.deepStrictEqual(
        tagsToLocation({ CITY: 'CARLSBAD', STATE: 'CA', COUNTRY: 'US' }),
        { city: 'carlsbad', stateCode: 'CA', zip: null, street: null },
    );
    assert.deepStrictEqual(
        tagsToLocation({ 'addr:street': 'Tiger Road', 'addr:housenumber': '14255', 'addr:state': 'IN', 'addr:postcode': '47523' }),
        { city: null, stateCode: 'IN', zip: '47523', street: '14255 Tiger Road' },
    );
    assert.deepStrictEqual(tagsToLocation(null), { city: null, stateCode: null, zip: null, street: null });
    console.log('self-check passed');
};

if (SELF_CHECK) {
    runSelfCheck();
    process.exit(0);
}

const prisma = new PrismaClient();

(async () => {
    // Only towers with no parcel: the ones that render blank in the list. Towers
    // that already have a parcel keep whatever address data they carry.
    // --tags-only re-reads rows an earlier run already filled, to backfill the
    // city from stored tags without repeating the geocode.
    const parcelCond = TAGS_ONLY
        ? Prisma.sql`p.id IS NOT NULL AND p.country = 'USA'`
        : Prisma.sql`p.id IS NULL`;
    const towers = await prisma.$queryRaw`
        SELECT t.id, t.lat, t.lon, t."rawExcelData",
               p."stateRaw" AS "parcelState", p."cityRaw" AS "parcelCity",
               p."county" AS "parcelCounty",
               p."zip" AS "parcelZip", p."address" AS "parcelAddress"
        FROM "Tower" t
        LEFT JOIN "Parcel" p ON p."towerId" = t.id
        WHERE ${parcelCond}
          AND t.lat >= ${USA_BBOX.minLat} AND t.lat <= ${USA_BBOX.maxLat}
          AND t.lon >= ${USA_BBOX.minLon} AND t.lon <= ${USA_BBOX.maxLon}
        ORDER BY t.id
        ${LIMIT ? Prisma.raw(`LIMIT ${Math.max(1, Math.trunc(LIMIT))}`) : Prisma.empty}
    `;

    // --normalize re-derives the stored names and address from an earlier run,
    // so a fix to barePlace or composeAddress reaches rows already written.
    // One UPDATE over the set, not a round trip per row.
    if (NORMALIZE) {
        const rows = await prisma.$queryRaw`
            SELECT p.id, p."cityRaw", p.county, p.address, p."stateRaw", p.zip
            FROM "Parcel" p
            WHERE p.country = 'USA' AND p."dataSource" = 'Census TIGERweb'
        `;
        const changes = [];
        for (const row of rows) {
            const city = row.cityRaw ? lowerName(row.cityRaw) : null;
            const county = row.county ? lowerName(row.county) : null;
            const address = composeAddress({ city, county, state: row.stateRaw, zip: row.zip });
            if (city === row.cityRaw && county === row.county && address === row.address) continue;
            changes.push({ id: row.id, city, county, address });
        }
        console.log(`${rows.length} parcel(s) checked, ${changes.length} need normalizing`);
        if (!WRITE) {
            console.log('Dry run. Re-run with --write and --normalize to persist.');
            return;
        }
        // Batched so a 14k-row set does not build one giant statement.
        for (let i = 0; i < changes.length; i += 500) {
            const batch = changes.slice(i, i + 500);
            const ids = batch.map((c) => c.id);
            const cities = batch.map((c) => c.city);
            const counties = batch.map((c) => c.county);
            const addresses = batch.map((c) => c.address);
            await prisma.$executeRaw`
                UPDATE "Parcel" p
                SET "cityRaw" = v.city, county = v.county, address = v.address
                FROM (
                    SELECT * FROM unnest(
                        ${ids}::int[], ${cities}::text[], ${counties}::text[], ${addresses}::text[]
                    ) AS t(id, city, county, address)
                ) v
                WHERE p.id = v.id
            `;
        }
        console.log(`updated ${changes.length} parcel(s)`);
        return;
    }

    const provinceIds = new Map(
        (await prisma.province.findMany({ select: { id: true, code: true } })).map((row) => [row.code, row.id]),
    );

    console.log(`${towers.length} tower(s) without a parcel; ${WRITE ? 'writing' : 'dry run'}`);

    const stats = { towers: towers.length, visited: 0, resolved: 0, partial: 0, failed: [], byState: {} };
    let cursor = 0;
    const started = Date.now();

    const worker = async () => {
        while (cursor < towers.length) {
            const tower = towers[cursor];
            cursor += 1;
            try {
                // --tags-only skips the network: the parcel already holds the
                // geocoded fields, and only the city needs the stored tags.
                const geocoded = TAGS_ONLY
                    ? { stateCode: null, county: null, city: null, zip: null }
                    : await lookupLocation(tower.lat, tower.lon);
                // The tower's own tags are first-hand: prefer them where the
                // geocoder is silent, which is rural land with no incorporated place.
                const tagged = tagsToLocation(tower.rawExcelData);
                const location = {
                    stateCode: geocoded.stateCode ?? tagged.stateCode ?? tower.parcelState ?? null,
                    county: geocoded.county ?? tower.parcelCounty ?? null,
                    city: geocoded.city ?? tagged.city ?? tower.parcelCity ?? null,
                    zip: geocoded.zip ?? tagged.zip ?? tower.parcelZip ?? null,
                };
                const street = tagged.street;
                stats.visited += 1;
                if (location.stateCode) {
                    stats.resolved += 1;
                    stats.byState[location.stateCode] = (stats.byState[location.stateCode] ?? 0) + 1;
                } else {
                    stats.partial += 1;
                }

                if (!WRITE) continue;

                const provinceId = location.stateCode ? provinceIds.get(location.stateCode) ?? null : null;
                const address = composeAddress({
                    streetName: street,
                    city: location.city,
                    county: location.county,
                    state: location.stateCode,
                    zip: location.zip,
                });

                await prisma.parcel.upsert({
                    where: { towerId: tower.id },
                    create: {
                        towerId: tower.id,
                        country: 'USA',
                        stateRaw: location.stateCode,
                        provinceRaw: location.stateCode,
                        cityRaw: location.city,
                        countyRaw: location.county,
                        zip: location.zip,
                        address,
                        provinceId,
                        dataSource: 'Census TIGERweb',
                        rawData: location,
                    },
                    update: {
                        country: 'USA',
                        stateRaw: location.stateCode,
                        provinceRaw: location.stateCode,
                        cityRaw: location.city,
                        countyRaw: location.county,
                        zip: location.zip,
                        address,
                        provinceId,
                        dataSource: 'Census TIGERweb',
                        rawData: location,
                    },
                });
            } catch (error) {
                stats.failed.push({ id: tower.id, error: error.message });
            }

            if (stats.visited % 500 === 0) {
                const elapsed = (Date.now() - started) / 1000;
                const rate = stats.visited / elapsed;
                console.log(`  ${stats.visited}/${towers.length} · ${rate.toFixed(1)}/s · eta ${Math.round((towers.length - stats.visited) / rate)}s`);
            }
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const elapsed = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`\nvisited ${stats.visited} in ${elapsed}s`);
    console.log(`state resolved: ${stats.resolved}, no state: ${stats.partial}, failed: ${stats.failed.length}`);
    const topStates = Object.entries(stats.byState).sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log('top states:', topStates.map(([code, n]) => `${code}:${n}`).join(' '));
    if (stats.failed.length) console.log('first failures:', JSON.stringify(stats.failed.slice(0, 3)));
    if (!WRITE) console.log('\nDry run. Re-run with --write to persist.');
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
