// Syncs the Brett call sheet into towers that already exist, and fills
// Parcel.address from the sheet's Location column.
//
// Usage:
//   node scripts/sync-brett-call-sheet.js ["/path/to/sheet.xlsx"]          # dry run
//   node scripts/sync-brett-call-sheet.js ["/path/to/sheet.xlsx"] --write  # persist
//
// Dedupe order matches the importer: Tower #, then Parcel ID (USA), then lat/lon.
// Scope is this sheet only. It never touches tower status, notes or owners.
// Parcel.address is written only when empty. Phone numbers are added only when
// missing. rawImportData keeps the newer sheet value for the keys that changed.
//
// Address parsing note: LocationNormalizationService parses Parcel.address only
// when country is Canada, so a USA address is not re-parsed into streetNumber
// or streetName later. Nothing overwrites the value this script writes.
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const DEFAULT_PATH = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
    || '/Users/kurtcalacday/Downloads/_ 11. Remake Brett Larry\'s Cousin Call Sheet new towers only 20260305.xlsx';
const BATCH = 'brett-call-sheet-20260305';
const WRITE = process.argv.includes('--write');
const USA_BBOX = { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };

const COORD_OVERRIDES = new Map([
    ['438', { lat: 41.7648828, lon: -87.72718221 }],
]);

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

// rawImportData keys this sync refreshes. Status, notes and owners are excluded.
const SYNCED_RAW_KEYS = [
    ['Pri', 'pri'],
    ['Callback', 'callback'],
    ['Sitename', 'sitename'],
    ['StructureClassification', 'classification'],
    ['StructureType', 'structureType'],
    ['Ground Elevation', 'groundElevation'],
    ['Height', 'height'],
    ['Location', 'location'],
    ['City', 'city'],
    ['State', 'state'],
    ['Zipcode', 'zipcode'],
    ['County', 'county'],
    ['MTAName', 'mta'],
    ['BTAName', 'bta'],
    ['Latitude', 'latitude'],
    ['Longitude', 'longitude'],
    ['# Users', 'users'],
    ['Recount', 'recount'],
    ['Owner', 'owner'],
    ['Contacts', 'contacts'],
    ['Address Ownr', 'ownerAddress'],
    ['Address Ownr 2', 'ownerAddress2'],
    ['Phone', 'phone'],
    ['PI callers', 'piCallers'],
    ['Brett Notes', 'brettNotes'],
    ['Misc MM', 'miscMM'],
    ['Title', 'title'],
    ['Parcel ID', 'parcelId'],
    ['LS Expn', 'lsExpn'],
    ['TowerOwner', 'towerOwner'],
    ['Steel Ownr', 'steelOwner'],
];

const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g;
const VALID_PHONE_RE = /^[2-9]\d{2}[2-9]\d{6}$/;

const cellRaw = (cell) => {
    const value = cell?.value;
    if (value == null) return '';
    let text;
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) text = value.richText.map((part) => part.text).join('');
        else if (value.text != null) text = value.text;
        else if (value.result != null) text = value.result;
        else text = '';
    } else {
        text = value;
    }
    return String(text).replace(/\r\n/g, '\n').trim();
};

const normalizeSpace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

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

const resolveCoordinates = (row) => {
    let lat = Number.parseFloat(row.latitude);
    let lon = Number.parseFloat(row.longitude);
    const override = row.towerNumber ? COORD_OVERRIDES.get(row.towerNumber) : undefined;
    if (override && (!Number.isFinite(lat) || !Number.isFinite(lon))) {
        lat = override.lat;
        lon = override.lon;
    }
    const valid = Number.isFinite(lat) && Number.isFinite(lon)
        && lat >= USA_BBOX.minLat && lat <= USA_BBOX.maxLat
        && lon >= USA_BBOX.minLon && lon <= USA_BBOX.maxLon;
    return valid ? { lat, lon } : null;
};

// Street-shaped values start with a house number. Everything else is a site
// description ("top of belleview mountain") and is reported, not hidden.
const looksLikeAddress = (value) => /^\s*\d/.test(value ?? '');

const prisma = new PrismaClient();

(async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(DEFAULT_PATH);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error(`No worksheet in ${DEFAULT_PATH}`);

    const [towerNumbers, usParcels, allTowers, parcels, towers] = await Promise.all([
        prisma.$queryRaw`SELECT id, "rawExcelData"->>'Tower #' AS "towerNumber" FROM "Tower" WHERE "rawExcelData"->>'Tower #' IS NOT NULL`,
        prisma.parcel.findMany({ where: { country: 'USA', parcelId: { not: null } }, select: { parcelId: true, towerId: true } }),
        prisma.tower.findMany({ select: { id: true, lat: true, lon: true } }),
        prisma.parcel.findMany({ where: { country: 'USA' }, select: { id: true, towerId: true, address: true, cityRaw: true, stateRaw: true, zip: true } }),
        prisma.tower.findMany({ where: { source: 'markslist' }, select: { id: true, rawImportData: true } }),
    ]);
    const towerNumberIndex = new Map(towerNumbers.map((item) => [item.towerNumber, item.id]));
    const parcelIndex = new Map(usParcels.map((item) => [normalizeSpace(item.parcelId), item.towerId]));
    const coordinateIndex = new Map(allTowers.map((tower) => [`${tower.lat},${tower.lon}`, tower.id]));
    const parcelByTower = new Map(parcels.map((parcel) => [parcel.towerId, parcel]));
    const rawByTower = new Map(towers.map((tower) => [tower.id, tower.rawImportData]));
    const phoneRows = await prisma.phone.findMany({
        where: { tower: { source: 'markslist' } },
        select: { towerId: true, number: true },
    });
    const phonesByTower = new Map();
    for (const phone of phoneRows) {
        if (!phonesByTower.has(phone.towerId)) phonesByTower.set(phone.towerId, new Set());
        phonesByTower.get(phone.towerId).add(phone.number);
    }

    const matched = [];
    const unmatched = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = {};
        for (const [key, column] of Object.entries(COLUMNS)) row[key] = cellRaw(sheet.getCell(rowNumber, column));
        if (!row.towerNumber && !row.latitude && !row.longitude) continue;

        const towerNumber = normalizeSpace(row.towerNumber);
        const coords = resolveCoordinates({ ...row, towerNumber });
        const towerId = (towerNumber ? towerNumberIndex.get(towerNumber) : undefined)
            ?? (row.parcelId ? parcelIndex.get(normalizeSpace(row.parcelId)) : undefined)
            ?? (coords ? coordinateIndex.get(`${coords.lat},${coords.lon}`) : undefined);

        if (!towerId) {
            unmatched.push({ rowNumber, row });
            continue;
        }
        matched.push({ row, towerId });
    }

    const addresses = [];
    const phoneAdds = [];
    const rawChanges = [];

    for (const { row, towerId } of matched) {
        const parcel = parcelByTower.get(towerId);
        if (!parcel) continue;

        const location = String(row.location ?? '').trim();
        if (!parcel.address && location) {
            addresses.push({ towerId, parcelId: parcel.id, address: location, street: looksLikeAddress(location) });
        }

        const have = phonesByTower.get(towerId) ?? new Set();
        const missing = extractPhones(row.phone).filter((number) => !have.has(number));
        if (missing.length > 0) phoneAdds.push({ towerId, numbers: missing });

        const current = rawByTower.get(towerId);
        const base = current && typeof current === 'object' ? current : {};
        const changed = {};
        for (const [key, field] of SYNCED_RAW_KEYS) {
            const next = String(row[field] ?? '').trim();
            const before = base[key] == null ? '' : String(base[key]).trim();
            if (!next || normalizeSpace(next) === normalizeSpace(before)) continue;
            changed[key] = next;
        }
        if (Object.keys(changed).length > 0) rawChanges.push({ towerId, changed, current: base });
    }

    const descriptions = addresses.filter((item) => !item.street);
    console.log(`--- Brett call sheet sync: ${WRITE ? 'WRITE' : 'DRY RUN'} ---`);
    console.log(`Sheet rows matched to towers: ${matched.length}`);
    console.log(`Sheet rows unmatched: ${unmatched.length}`);
    for (const item of unmatched) {
        console.log(`  row ${item.rowNumber} ${item.row.towerNumber || '(no Tower #)'} ${item.row.city} ${item.row.state}: no tower found`);
    }

    console.log(`\nAddresses to fill: ${addresses.length}`);
    console.log(`  street-shaped: ${addresses.length - descriptions.length}`);
    console.log(`  site descriptions: ${descriptions.length}`);
    for (const item of descriptions) {
        console.log(`  tower ${item.towerId}: ${item.address}`);
    }

    console.log(`\nTowers needing phones: ${phoneAdds.length}`);
    console.log(`  numbers to add: ${phoneAdds.reduce((sum, item) => sum + item.numbers.length, 0)}`);
    for (const item of phoneAdds) {
        console.log(`  tower ${item.towerId}: +${item.numbers.length}`);
    }

    const changedKeys = rawChanges.reduce((counts, item) => {
        for (const key of Object.keys(item.changed)) counts[key] = (counts[key] ?? 0) + 1;
        return counts;
    }, {});
    console.log(`\nTowers with raw changes: ${rawChanges.length}`);
    console.log(`  keys: ${Object.entries(changedKeys).map(([key, count]) => `${key}(${count})`).join(' ') || 'none'}`);

    if (!WRITE) {
        console.log('\nDry run only. Add --write to persist.');
        return;
    }

    let addressWrites = 0;
    let phoneWrites = 0;
    let rawWrites = 0;
    for (const item of addresses) {
        await prisma.parcel.update({ where: { id: item.parcelId }, data: { address: item.address } });
        addressWrites += 1;
    }
    for (const item of phoneAdds) {
        await prisma.phone.createMany({
            data: item.numbers.map((number) => ({ number, status: 'unknown', towerId: item.towerId })),
        });
        phoneWrites += item.numbers.length;
    }
    for (const item of rawChanges) {
        await prisma.tower.update({
            where: { id: item.towerId },
            data: { rawImportData: { ...item.current, ...item.changed, _syncedFrom: BATCH } },
        });
        rawWrites += 1;
    }

    const [addressCount, missingAddress] = await Promise.all([
        prisma.parcel.count({ where: { country: 'USA', address: { not: null } } }),
        prisma.parcel.count({ where: { country: 'USA', address: null } }),
    ]);
    console.log(`\nWrote ${addressWrites} addresses, ${phoneWrites} phones, ${rawWrites} raw rows`);
    console.log(`USA parcels with address: ${addressCount}, without: ${missingAddress}`);
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
