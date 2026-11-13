// Imports the Brett call sheet into the USA tower list.
//
// Usage:
//   node scripts/import-brett-call-sheet.js ["/path/to/sheet.xlsx"]          # dry run
//   node scripts/import-brett-call-sheet.js ["/path/to/sheet.xlsx"] --write  # persist
//   node scripts/import-brett-call-sheet.js --self-check
//
// Dedupe order: rawImportData.Tower #, then Parcel.parcelId (USA), then exact lat/lon.
// Every created tower carries _batch in rawImportData for an exact rollback.
require('dotenv').config({ quiet: true });
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const DEFAULT_PATH = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
    || '/Users/kurtcalacday/Downloads/_ 11. Remake Brett Larry\'s Cousin Call Sheet new towers only 20260305.xlsx';
const BATCH = 'brett-call-sheet-20260305';
const SOURCE = 'markslist';
const WRITE = process.argv.includes('--write');
const SELF_CHECK = process.argv.includes('--self-check');
const USA_BBOX = { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };
const NEARBY_METERS = 250;

// Tower 438 has no Latitude. Longitude holds 41.76483, so use the corrected
// coordinates recorded in its Misc MM note.
const COORD_OVERRIDES = new Map([
    ['438', { lat: 41.7648828, lon: -87.72718221 }],
]);

// Column numbers are 1-based Excel columns. Tracker columns 36-53 are dropped.
const COLUMNS = {
    pri: 2,
    priAlt: 3,
    callback: 4,
    towerNumber: 5,
    sitename: 6,
    classification: 7,
    structureType: 8,
    groundElevation: 9,
    height: 10,
    location: 11,
    city: 12,
    state: 13,
    zipcode: 14,
    county: 15,
    mta: 16,
    bta: 17,
    latitude: 18,
    longitude: 19,
    users: 20,
    recount: 21,
    owner: 22,
    contacts: 23,
    ownerAddress: 24,
    ownerAddress2: 25,
    phone: 26,
    piCallers: 27,
    brettNotes: 28,
    miscMM: 30,
    title: 31,
    parcelId: 32,
    lsExpn: 33,
    towerOwner: 34,
    steelOwner: 35,
};

const REQUIRED_HEADERS = new Map([
    [COLUMNS.towerNumber, 'Tower #'],
    [COLUMNS.sitename, 'Sitename'],
    [COLUMNS.city, 'City'],
    [COLUMNS.state, 'State'],
    [COLUMNS.latitude, 'Latitude'],
    [COLUMNS.longitude, 'Longitude'],
    [COLUMNS.owner, 'Owner'],
    [COLUMNS.parcelId, 'Parcel ID'],
    [COLUMNS.towerOwner, 'TowerOwner'],
]);

const NOTES = [
    { key: 'brettNotes', initials: 'Brett' },
    { key: 'miscMM', initials: 'MM' },
    { key: 'piCallers', initials: 'PI' },
    { key: 'contacts', initials: 'Contacts' },
];

const STRUCTURE_TYPE_NAMES = new Map([
    ['monopole', 'Monopole Tower'],
    ['mpl', 'Monopole Tower'],
    ['mp', 'Monopole Tower'],
    ['mono', 'Monopole Tower'],
    ['pole', 'Monopole Tower'],
    ['slf spt', 'Lattice Tower'],
    ['self support', 'Lattice Tower'],
    ['self support tower', 'Lattice Tower'],
    ['sst', 'Lattice Tower'],
    ['lattice', 'Lattice Tower'],
    ['mast', 'Lattice Tower'],
    ['t', 'Lattice Tower'],
    ['tower', 'Lattice Tower'],
    ['guyed', 'Guyed'],
    ['sign', 'Other Structure'],
    ['stealth tree', 'Other Structure'],
    ['land', 'N/A'],
]);

const CARRIER_ALIASES = new Map([
    ['tmo', 'TMO'],
    ['message cntr mgt', 'Message Cntr Mgt'],
]);

const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g;
const VALID_PHONE_RE = /^[2-9]\d{2}[2-9]\d{6}$/;
const NORTHEAST_STATES = new Set(['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT']);
const US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
    'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
    'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN',
    'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

const cellRaw = (cell) => {
    const value = cell?.value;
    if (value == null) return '';
    let text;
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) {
            text = value.richText.map((part) => part.text).join('');
        } else if (value.text != null) {
            text = value.text;
        } else if (value.result != null) {
            text = value.result;
        } else {
            text = '';
        }
    } else {
        text = value;
    }
    return String(text).replace(/\r\n/g, '\n').trim();
};

const normalizeSpace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeZip = (value, state) => {
    const raw = normalizeSpace(value).replace(/\.0$/, '');
    if (!raw) return { zip: null, warning: null };
    if (!/^\d+$/.test(raw)) return { zip: raw, warning: null };
    if (raw.length === 5) return { zip: raw, warning: null };
    if (raw.length === 4 && NORTHEAST_STATES.has(state)) {
        return { zip: `0${raw}`, warning: null };
    }
    return { zip: raw, warning: `unexpected ZIP length ${raw.length}: ${raw}` };
};

const structureTypeName = (value) => {
    const key = normalizeSpace(value).toLowerCase();
    return STRUCTURE_TYPE_NAMES.get(key) ?? null;
};

const carrierName = (value) => {
    const raw = normalizeSpace(value);
    if (!raw) return null;
    return CARRIER_ALIASES.get(raw.toLowerCase()) ?? raw;
};

const extractPhones = (value) => {
    const matches = String(value ?? '').match(PHONE_RE) ?? [];
    const unique = new Set();
    for (const match of matches) {
        let digits = match.replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
        if (digits.length > 10) digits = digits.slice(-10);
        if (VALID_PHONE_RE.test(digits)) unique.add(digits);
    }
    return [...unique];
};

const haversineMeters = (latA, lonA, latB, lonB) => {
    const earthRadius = 6371000;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(latB - latA);
    const deltaLon = toRadians(lonB - lonA);
    const a = (Math.sin(deltaLat / 2) ** 2)
        + (Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * (Math.sin(deltaLon / 2) ** 2));
    return 2 * earthRadius * Math.asin(Math.sqrt(a));
};

const inUsaBbox = (lat, lon) => lat >= USA_BBOX.minLat && lat <= USA_BBOX.maxLat
    && lon >= USA_BBOX.minLon && lon <= USA_BBOX.maxLon;

const rowLabel = (row) => [
    row.towerNumber || '(no Tower #)',
    row.city,
    row.state,
].filter(Boolean).join(' ');

const parseRow = (sheet, rowNumber) => {
    const values = {};
    for (const [key, column] of Object.entries(COLUMNS)) {
        values[key] = cellRaw(sheet.getCell(rowNumber, column));
    }
    return values;
};

const isEmptyRow = (row) => !row.towerNumber
    && !row.latitude
    && !row.longitude
    && !row.owner
    && !row.city
    && !row.state;

const buildRaw = (row, coordFix) => {
    const entries = {
        Pri: row.pri,
        'Pri 2': row.priAlt,
        Callback: row.callback,
        'Tower #': row.towerNumber,
        Sitename: row.sitename,
        StructureClassification: row.classification,
        StructureType: row.structureType,
        'Ground Elevation': row.groundElevation,
        Height: row.height,
        Location: row.location,
        City: row.city,
        State: row.state,
        Zipcode: row.zipcode,
        County: row.county,
        MTAName: row.mta,
        BTAName: row.bta,
        Latitude: row.latitude,
        Longitude: row.longitude,
        '# Users': row.users,
        Recount: row.recount,
        Owner: row.owner,
        Contacts: row.contacts,
        'Address Ownr': row.ownerAddress,
        'Address Ownr 2': row.ownerAddress2,
        Phone: row.phone,
        'PI callers': row.piCallers,
        'Brett Notes': row.brettNotes,
        'Misc MM': row.miscMM,
        Title: row.title,
        'Parcel ID': row.parcelId,
        'LS Expn': row.lsExpn,
        TowerOwner: row.towerOwner,
        'Steel Ownr': row.steelOwner,
        _batch: BATCH,
    };
    if (coordFix) entries._coordFix = `${coordFix.lat}, ${coordFix.lon}`;
    return Object.fromEntries(
        Object.entries(entries).filter(([, value]) => value != null && value !== ''),
    );
};

const resolveCoordinates = (row) => {
    let lat = Number.parseFloat(row.latitude);
    let lon = Number.parseFloat(row.longitude);
    const override = row.towerNumber ? COORD_OVERRIDES.get(row.towerNumber) : undefined;
    let coordFix = null;
    if (override && (!Number.isFinite(lat) || !inUsaBbox(lat, lon))) {
        lat = override.lat;
        lon = override.lon;
        coordFix = override;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { lat: null, lon: null, coordFix, reason: 'missing coordinates' };
    }
    if (!inUsaBbox(lat, lon)) {
        return { lat, lon, coordFix, reason: 'coordinates outside USA bbox' };
    }
    return { lat, lon, coordFix, reason: null };
};

const runSelfCheck = () => {
    assert.deepStrictEqual(normalizeZip('6438', 'CT'), { zip: '06438', warning: null });
    assert.deepStrictEqual(normalizeZip('06801-2845', 'CT'), { zip: '06801-2845', warning: null });
    assert.deepStrictEqual(normalizeZip('8098', 'NJ'), { zip: '08098', warning: null });
    assert.strictEqual(structureTypeName('MPL'), 'Monopole Tower');
    assert.strictEqual(structureTypeName('Slf Spt'), 'Lattice Tower');
    assert.strictEqual(structureTypeName('Guyed'), 'Guyed');
    assert.strictEqual(structureTypeName('Sign'), 'Other Structure');
    assert.deepStrictEqual(extractPhones(''), []);
    assert.strictEqual(VALID_PHONE_RE.test(['0', '00', '000', '0000'].join('')), false);
    assert.strictEqual(haversineMeters(0, 0, 0, 0), 0);
    console.log('self-check passed');
};

if (SELF_CHECK) {
    runSelfCheck();
    process.exit(0);
}

const prisma = new PrismaClient();

(async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(DEFAULT_PATH);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error(`No worksheet in ${DEFAULT_PATH}`);

    for (const [column, expected] of REQUIRED_HEADERS) {
        const actual = cellRaw(sheet.getCell(1, column));
        if (actual !== expected) {
            throw new Error(`Column ${column}: expected header "${expected}", found "${actual}"`);
        }
    }

    const [types, statuses, towerNumbers, usParcels, allTowers] = await Promise.all([
        prisma.towerType.findMany({ select: { id: true, name: true } }),
        prisma.towerStatus.findMany({ select: { id: true, name: true } }),
        // Indexed once: a per-row JSON path query over 65k towers is too slow.
        prisma.$queryRaw`SELECT id, "rawExcelData"->>'Tower #' AS "towerNumber" FROM "Tower" WHERE "rawExcelData"->>'Tower #' IS NOT NULL`,
        prisma.parcel.findMany({ where: { country: 'USA', parcelId: { not: null } }, select: { parcelId: true, towerId: true } }),
        prisma.tower.findMany({ select: { id: true, lat: true, lon: true, source: true } }),
    ]);
    const towerNumberIndex = new Map(towerNumbers.map((item) => [item.towerNumber, item.id]));
    const parcelIndex = new Map(usParcels.map((item) => [normalizeSpace(item.parcelId), item.towerId]));
    const coordinateIndex = new Map(allTowers.map((tower) => [`${tower.lat},${tower.lon}`, tower.id]));
    const typeIds = new Map(types.map((type) => [type.name, type.id]));
    const statusId = statuses.find((status) => status.name === 'Determining Owner (Calls)')?.id;
    if (!statusId) throw new Error('Missing TowerStatus "Determining Owner (Calls)"');

    const stats = {
        rows: 0,
        importable: [],
        duplicates: [],
        held: [],
        nearby: [],
        unknownTypes: [],
        invalidPhones: [],
        zipWarnings: [],
        zipPadded: [],
    };

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = parseRow(sheet, rowNumber);
        if (isEmptyRow(row)) continue;
        stats.rows += 1;

        const towerNumber = normalizeSpace(row.towerNumber);
        const state = normalizeSpace(row.state).toUpperCase();
        if (state && !US_STATES.has(state)) {
            stats.held.push({ row, reason: `unknown state ${state}` });
            continue;
        }

        const coords = resolveCoordinates({ ...row, towerNumber });
        if (!coords.reason) {
            const towerIdByNumber = towerNumber ? towerNumberIndex.get(towerNumber) : undefined;
            let duplicate = towerIdByNumber ? { towerId: towerIdByNumber, reason: 'tower #' } : null;

            if (!duplicate && row.parcelId) {
                const towerIdByParcel = parcelIndex.get(normalizeSpace(row.parcelId));
                if (towerIdByParcel) duplicate = { towerId: towerIdByParcel, reason: 'parcel id' };
            }

            if (!duplicate) {
                const towerIdByCoords = coordinateIndex.get(`${coords.lat},${coords.lon}`);
                if (towerIdByCoords) duplicate = { towerId: towerIdByCoords, reason: 'coordinates' };
            }

            if (duplicate) {
                stats.duplicates.push({ row, ...duplicate });
                continue;
            }
        }

        if (coords.reason) {
            stats.held.push({ row, reason: coords.reason });
            continue;
        }

        const zip = normalizeZip(row.zipcode, state);
        if (zip.warning) stats.zipWarnings.push({ row, warning: zip.warning });
        if (zip.zip && zip.zip !== normalizeSpace(row.zipcode)) {
            stats.zipPadded.push({ row, from: normalizeSpace(row.zipcode), to: zip.zip });
        }

        const typeName = structureTypeName(row.structureType);
        if (!typeName) {
            stats.unknownTypes.push({ row, value: row.structureType });
        }

        const phones = extractPhones(row.phone);
        if (row.phone && phones.length === 0) {
            stats.invalidPhones.push({ row, value: row.phone });
        }

        stats.importable.push({
            row: { ...row, towerNumber, state },
            lat: coords.lat,
            lon: coords.lon,
            coordFix: coords.coordFix,
            zip: zip.zip,
            typeName,
            phones,
        });
    }

    const usaTowers = await prisma.tower.findMany({
        where: {
            OR: [
                { parcel: { country: { equals: 'USA', mode: 'insensitive' } } },
                { parcel: { is: null }, lat: { gte: USA_BBOX.minLat, lte: USA_BBOX.maxLat }, lon: { gte: USA_BBOX.minLon, lte: USA_BBOX.maxLon } },
            ],
        },
        select: { id: true, lat: true, lon: true, source: true, businessName: true },
    });

    for (const item of stats.importable) {
        let nearest = null;
        for (const tower of usaTowers) {
            const distance = haversineMeters(item.lat, item.lon, tower.lat, tower.lon);
            if (!nearest || distance < nearest.distance) nearest = { distance, tower };
        }
        if (nearest && nearest.distance <= NEARBY_METERS) {
            stats.nearby.push({ row: item.row, ...nearest });
        }
    }

    const duplicateCounts = stats.duplicates.reduce((counts, item) => {
        counts[item.reason] = (counts[item.reason] ?? 0) + 1;
        return counts;
    }, {});

    console.log(`--- Brett call sheet: ${WRITE ? 'WRITE' : 'DRY RUN'} ---`);
    console.log(`File: ${DEFAULT_PATH}`);
    console.log(`Rows: ${stats.rows}`);
    console.log(`Importable: ${stats.importable.length}`);
    console.log(`Skipped duplicates: ${stats.duplicates.length} (${Object.entries(duplicateCounts).map(([key, value]) => `${key}: ${value}`).join(', ')})`);
    for (const item of stats.duplicates) {
        console.log(`  skip ${rowLabel(item.row)} -> tower ${item.towerId} (${item.reason})`);
    }

    console.log(`Held: ${stats.held.length}`);
    for (const item of stats.held) {
        console.log(`  hold ${rowLabel(item.row)}: ${item.reason}`);
    }

    console.log(`Nearby towers within ${NEARBY_METERS} m: ${stats.nearby.length}`);
    for (const item of stats.nearby) {
        console.log(`  ${rowLabel(item.row)} ${Math.round(item.distance)} m from tower ${item.tower.id} (${item.tower.source})`);
    }

    if (stats.zipPadded.length > 0) {
        console.log(`ZIPs padded: ${stats.zipPadded.length}`);
        for (const item of stats.zipPadded) console.log(`  ${rowLabel(item.row)} ${item.from} -> ${item.to}`);
    }
    if (stats.zipWarnings.length > 0) {
        console.log(`ZIP warnings: ${stats.zipWarnings.length}`);
        for (const item of stats.zipWarnings) console.log(`  ${rowLabel(item.row)}: ${item.warning}`);
    }
    if (stats.unknownTypes.length > 0) {
        console.log(`Unknown structure types: ${stats.unknownTypes.length}`);
        for (const item of stats.unknownTypes) console.log(`  ${rowLabel(item.row)}: ${JSON.stringify(item.value)}`);
    }
    if (stats.invalidPhones.length > 0) {
        console.log(`Rows with no valid phone: ${stats.invalidPhones.length}`);
        for (const item of stats.invalidPhones) console.log(`  ${rowLabel(item.row)}`);
    }

    if (!WRITE) {
        console.log('\nDry run only. Add --write to persist.');
        return;
    }

    const carriers = await prisma.carrier.findMany({ select: { id: true, name: true } });
    const carrierIds = new Map(carriers.map((carrier) => [carrier.name, carrier.id]));
    const missingCarriers = new Set();
    const created = { towers: 0, parcels: 0, owners: 0, phones: 0, notes: 0, errors: [] };

    for (const item of stats.importable) {
        const { row } = item;
        try {
            const carrier = carrierName(row.towerOwner);
            if (carrier && !carrierIds.has(carrier)) missingCarriers.add(carrier);

            for (const missing of missingCarriers) {
                const createdCarrier = await prisma.carrier.create({ data: { name: missing } });
                carrierIds.set(missing, createdCarrier.id);
            }
            missingCarriers.clear();

            const ownerName = normalizeSpace(row.owner) || 'Unknown Owner';
            const ownerAddress = [row.ownerAddress, row.ownerAddress2]
                .map((part) => normalizeSpace(part))
                .filter(Boolean)
                .join(', ') || null;
            const noteRows = NOTES
                .map(({ key, initials }) => ({ initials, content: row[key] }))
                .filter((note) => note.content);
            let newOwner = false;

            await prisma.$transaction(async (tx) => {
                const tower = await tx.tower.create({
                    data: {
                        lat: item.lat,
                        lon: item.lon,
                        businessName: normalizeSpace(row.sitename) || null,
                        remarks: row.location || null,
                        source: SOURCE,
                        statusId,
                        typeId: item.typeName ? typeIds.get(item.typeName) ?? null : null,
                        carrierId: carrier ? carrierIds.get(carrier) ?? null : null,
                        rawImportData: buildRaw(row, item.coordFix),
                    },
                });

                let owner = await tx.owner.findFirst({
                    where: { name: ownerName, address: ownerAddress },
                    select: { id: true },
                });
                if (!owner) {
                    owner = await tx.owner.create({
                        data: { name: ownerName, address: ownerAddress },
                        select: { id: true },
                    });
                    newOwner = true;
                }

                await tx.parcel.create({
                    data: {
                        towerId: tower.id,
                        parcelId: normalizeSpace(row.parcelId) || null,
                        cityRaw: normalizeSpace(row.city).toLowerCase() || null,
                        stateRaw: row.state || null,
                        zip: item.zip,
                        countyRaw: normalizeSpace(row.county).toLowerCase() || null,
                        country: 'USA',
                        ownerId: owner.id,
                    },
                });

                if (item.phones.length > 0) {
                    await tx.phone.createMany({
                        data: item.phones.map((number) => ({
                            number,
                            status: 'unknown',
                            towerId: tower.id,
                        })),
                    });
                }

                if (noteRows.length > 0) {
                    await tx.note.createMany({
                        data: noteRows.map((note) => ({
                            content: note.content,
                            initials: note.initials,
                            towerId: tower.id,
                        })),
                    });
                }
            }, { timeout: 30000, maxWait: 15000 });

            created.towers += 1;
            created.parcels += 1;
            if (newOwner) created.owners += 1;
            created.phones += item.phones.length;
            created.notes += noteRows.length;
        } catch (error) {
            created.errors.push({ row, message: error instanceof Error ? error.message : String(error) });
        }
    }

    console.log('\n--- Write result ---');
    console.log(`Towers: ${created.towers}`);
    console.log(`Parcels: ${created.parcels}`);
    console.log(`Owners: ${created.owners}`);
    console.log(`Phones: ${created.phones}`);
    console.log(`Notes: ${created.notes}`);
    if (created.errors.length > 0) {
        console.log(`Errors: ${created.errors.length}`);
        for (const error of created.errors) console.log(`  ${rowLabel(error.row)}: ${error.message}`);
        process.exitCode = 1;
    }

    const [batchTowers, batchParcels] = await Promise.all([
        prisma.tower.count({ where: { rawImportData: { path: ['_batch'], equals: BATCH } } }),
        prisma.parcel.count({ where: { country: 'USA', tower: { rawImportData: { path: ['_batch'], equals: BATCH } } } }),
    ]);
    console.log(`Batch ${BATCH}: ${batchTowers} towers, ${batchParcels} USA parcels`);
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
