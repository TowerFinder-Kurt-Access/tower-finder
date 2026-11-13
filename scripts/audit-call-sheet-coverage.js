// Audits coverage: every data row in the call sheet must map to a tower in the
// USA list, by Tower #, parcel id, or a nearby coordinate. Reports only gaps.
//
// Usage: node scripts/audit-call-sheet-coverage.js
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SHEET = "/Users/kurtcalacday/Downloads/_ 11. Remake Brett Larry's Cousin Call Sheet new towers only 20260305.xlsx";

const haversine = (latA, lonA, latB, lonB) => {
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
    const text = (r, c) => String(sheet.getCell(r, c).value ?? '').trim();

    const rows = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
        const anyValue = [1, 2, 5, 6, 11, 12, 18, 19, 22, 32].some((c) => text(r, c));
        if (!anyValue) continue;
        rows.push({
            row: r,
            towerNumber: text(r, 5),
            sitename: text(r, 6),
            city: text(r, 12),
            state: text(r, 13),
            zip: text(r, 14),
            location: text(r, 11),
            lat: Number(text(r, 18)) || null,
            lon: Number(text(r, 19)) || null,
            parcelId: text(r, 32),
        });
    }

    const towers = await prisma.$queryRaw`
        SELECT t.id, t.lat, t.lon,
               t."rawExcelData"->>'Tower #' AS "towerNumber",
               p."parcelId"
        FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA'
    `;
    const byNumber = new Map();
    const byParcel = new Map();
    for (const t of towers) {
        if (t.towerNumber) byNumber.set(t.towerNumber.trim(), t.id);
        if (t.parcelId) byParcel.set(String(t.parcelId).trim(), t.id);
    }

    const matched = [];
    const gaps = [];
    for (const item of rows) {
        let id = null;
        let how = null;
        if (item.towerNumber && byNumber.has(item.towerNumber)) {
            id = byNumber.get(item.towerNumber);
            how = 'Tower #';
        } else if (item.parcelId && byParcel.has(item.parcelId)) {
            id = byParcel.get(item.parcelId);
            how = 'parcel id';
        } else if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
            const near = towers.find((t) => haversine(item.lat, item.lon, t.lat, t.lon) <= 100);
            if (near) { id = near.id; how = 'coordinates'; }
        }
        if (id) matched.push({ ...item, id, how });
        else gaps.push(item);
    }

    console.log(`sheet data rows: ${rows.length}`);
    console.log(`matched to a USA tower: ${matched.length}`);
    console.log(`unmatched: ${gaps.length}`);
    const byHow = matched.reduce((acc, m) => { acc[m.how] = (acc[m.how] ?? 0) + 1; return acc; }, {});
    console.log(`match method: ${JSON.stringify(byHow)}`);
    if (gaps.length) {
        console.log('\nunmatched rows:');
        for (const g of gaps) {
            console.log(`  row ${g.row} · ${g.towerNumber || '(no Tower #)'} · ${g.city} ${g.state} ${g.zip} · ${g.location}`);
        }
    }
    // A tower can be claimed by two sheet rows: that is a duplicate in the source.
    const claims = matched.reduce((acc, m) => { acc[m.id] = (acc[m.id] ?? 0) + 1; return acc; }, {});
    const shared = Object.entries(claims).filter(([, n]) => n > 1);
    console.log(`\nUSA towers claimed: ${Object.keys(claims).length}`);
    if (shared.length) console.log(`towers claimed by more than one sheet row: ${JSON.stringify(shared)}`);
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
