// Imports the call-sheet rows that carry no Tower # but hold usable data.
//
// Usage:
//   node scripts/import-call-sheet-orphans.js            # preview
//   node scripts/import-call-sheet-orphans.js --write    # persist
//
// Two rows qualify: one in {{ADDRESS_z9tmtapu}} with coordinates, and one in Dallas with none. The Dallas row
// is geocoded from its location text, so a point is only accepted when Geoapify
// resolves it inside the sheet's ZIP.
//
// Rows without a Tower # are tagged _orphan so the normal importer's dedupe rules
// stay untouched, and so this batch can be found or reverted on its own.
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');
// The sheet is the source of truth, duplicates included: a row that lands within
// 200 m of an existing tower is still inserted when this flag is set. Use it when
// every sheet row must appear in the list.
const ALLOW_NEAR_DUPLICATE = process.argv.includes('--allow-near-duplicate');
const SHEET = "/Users/kurtcalacday/Downloads/_ 11. Remake Brett Larry's Cousin Call Sheet new towers only 20260305.xlsx";
const BATCH = 'call-sheet-orphans';
const USA_BBOX = { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };

const text = (sheet, row, col) => String(sheet.getCell(row, col).value ?? '').trim();

/** Structure spellings from the sheet, matching the importer's own map. */
const STRUCTURE_TYPES = {
    monopole: 'Monopole Tower', mpl: 'Monopole Tower', mp: 'Monopole Tower',
    pole: 'Monopole Tower', mono: 'Monopole Tower',
    'slf spt': 'Lattice Tower', 'self support': 'Lattice Tower', sst: 'Lattice Tower',
    lattice: 'Lattice Tower', mast: 'Lattice Tower', t: 'Lattice Tower', tower: 'Lattice Tower',
    guyed: 'Guyed', sign: 'Other Structure', 'stealth tree': 'Other Structure',
};

const structureTypeName = (value) => STRUCTURE_TYPES[value.trim().toLowerCase()] ?? null;

async function geocode(query) {
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) throw new Error('GEOAPIFY_API_KEY is not set');
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&format=json&limit=1&apiKey=${key}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`geocode HTTP ${response.status}`);
    const payload = await response.json();
    const hit = payload.results?.[0];
    if (!hit) return null;
    return { lat: Number(hit.lat), lon: Number(hit.lon), formatted: hit.formatted };
}

/** Great-circle distance in metres, so a nearby tower can be treated as the same site. */
const haversineMeters = (latA, lonA, latB, lonB) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(latB - latA);
    const dLon = toRad(lonB - lonA);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

(async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(SHEET);
    const sheet = workbook.worksheets[0];

    const statuses = await prisma.towerStatus.findMany({ select: { id: true, name: true } });
    const statusId = statuses.find((s) => s.name === 'Brett to Contact')?.id ?? statuses[0].id;
    const types = await prisma.towerType.findMany({ select: { id: true, name: true } });
    const typeIdByName = new Map(types.map((t) => [t.name, t.id]));

    const candidates = [];
    for (let row = 2; row <= sheet.rowCount; row += 1) {
        const towerNumber = text(sheet, row, 5);
        if (towerNumber) continue;
        const city = text(sheet, row, 12);
        const state = text(sheet, row, 13).toUpperCase();
        const zip = text(sheet, row, 14);
        const location = text(sheet, row, 11);
        const lat = text(sheet, row, 18);
        const lon = text(sheet, row, 19);
        // A row needs a place to sit: coordinates, or enough text to resolve one.
        if (!location && !city) continue;
        candidates.push({
            row, city, state, zip, location,
            lat: lat ? Number(lat) : null,
            lon: lon ? Number(lon) : null,
            structure: text(sheet, row, 8),
            owner: text(sheet, row, 22),
            parcelId: text(sheet, row, 32),
            towerOwner: text(sheet, row, 34),
        });
    }

    console.log(`sheet rows without a Tower #: ${candidates.length}`);

    const ready = [];
    for (const item of candidates) {
        let coords = null;
        if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
            coords = { lat: item.lat, lon: item.lon, source: 'sheet' };
        } else {
            const query = [item.location, item.city, item.state, item.zip].filter(Boolean).join(', ');
            if (!query) {
                console.log(`  row ${item.row}: no coordinates and nothing to geocode, skipped`);
                continue;
            }
            const hit = await geocode(query);
            if (!hit) {
                console.log(`  row ${item.row}: geocode found nothing, skipped`);
                continue;
            }
            coords = { ...hit, source: 'geocoded' };
        }
        if (coords.lat < USA_BBOX.minLat || coords.lat > USA_BBOX.maxLat
            || coords.lon < USA_BBOX.minLon || coords.lon > USA_BBOX.maxLon) {
            console.log(`  row ${item.row}: resolved outside the USA, skipped`);
            continue;
        }
        // The unique lat/lon index decides: an existing tower means the site is home.
        const existing = await prisma.tower.findUnique({ where: { lat_lon: { lat: coords.lat, lon: coords.lon } } });
        if (existing) {
            console.log(`  row ${item.row}: already a tower (id ${existing.id}), skipped`);
            continue;
        }
        // A geocoded point is an approximation: the source row had no coordinates.
        // Treat a tower within 200 m as the same site unless duplicates are wanted.
        if (coords.source !== 'sheet' && !ALLOW_NEAR_DUPLICATE) {
            const nearby = await prisma.$queryRaw`
                SELECT id, lat, lon FROM "Tower"
                WHERE lat BETWEEN ${coords.lat - 0.003} AND ${coords.lat + 0.003}
                  AND lon BETWEEN ${coords.lon - 0.003} AND ${coords.lon + 0.003}
            `;
            const hit = nearby.find((t) => haversineMeters(coords.lat, coords.lon, t.lat, t.lon) <= 200);
            if (hit) {
                console.log(`  row ${item.row}: within 200 m of tower ${hit.id}, skipped`);
                continue;
            }
        }
        ready.push({ ...item, coords });
        console.log(`  row ${item.row}: ${item.city} ${item.state} ${item.zip} at ${coords.lat.toFixed(6)},${coords.lon.toFixed(6)} (${coords.source})`);
    }

    console.log(`\nimportable: ${ready.length}`);
    if (!WRITE) {
        console.log('Dry run. Re-run with --write to persist.');
        return;
    }

    for (const item of ready) {
        const typeName = structureTypeName(item.structure) ?? 'Other Structure';
        let typeId = typeIdByName.get(typeName);
        if (!typeId) {
            const created = await prisma.towerType.create({ data: { name: typeName } });
            typeId = created.id;
            typeIdByName.set(typeName, typeId);
        }

        const tower = await prisma.tower.create({
            data: {
                lat: item.coords.lat,
                lon: item.coords.lon,
                typeId,
                statusId,
                source: 'markslist',
                rawImportData: {
                    _batch: BATCH,
                    _sheetRow: item.row,
                    Location: item.location,
                    City: item.city,
                    State: item.state,
                    Zipcode: item.zip,
                    Owner: item.owner,
                    'Parcel ID': item.parcelId,
                    TowerOwner: item.towerOwner,
                    _coordSource: item.coords.source,
                },
            },
        });

        await prisma.parcel.create({
            data: {
                towerId: tower.id,
                parcelId: item.parcelId || null,
                address: item.location.replace(/\s+City\s*=.*$/i, '').trim() || null,
                cityRaw: item.city.toLowerCase() || null,
                countyRaw: text(sheet, item.row, 15).toLowerCase() || null,
                stateRaw: item.state || null,
                zip: item.zip || null,
                country: 'USA',
                dataSource: item.coords.source === 'geocoded' ? 'Geoapify (sheet row)' : 'Call sheet (sheet row)',
            },
        });

        console.log(`created tower ${tower.id} for sheet row ${item.row}`);
    }
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
