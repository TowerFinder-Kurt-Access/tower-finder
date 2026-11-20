// Deletes USA towers that did not come from the Brett call sheet, so the USA list
// matches that sheet alone. Canadian data is never touched.
//
// Usage:
//   node scripts/prune-usa-to-call-sheet.js                 # preview
//   node scripts/prune-usa-to-call-sheet.js --write         # delete
//   node scripts/prune-usa-to-call-sheet.js --xlsx path.xlsx  # override the sheet
//
// Requires a backup first: run scripts/backup-usa-towers.js and pass its directory
// with --backup so the script refuses to run without one.
//
// Owners are shared with Canadian parcels, so they are kept. Everything else that
// hangs off a deleted tower cascades with it.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_XLSX = "/Users/kurtcalacday/Downloads/_ 11. Remake Brett Larry's Cousin Call Sheet new towers only 20260305.xlsx";
const BATCH = 'brett-call-sheet-20260305';
const arg = (name, fallback = '') => {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WRITE = process.argv.includes('--write');

/**
 * Tower numbers from the sheet. The exported CSV has unquoted commas inside
 * address fields, so a row splits into 53 to 90 columns and the Tower # column
 * drifts. The workbook gives exact cells, so read that.
 */
async function sheetTowerNumbers(xlsxPath) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error(`no worksheet in ${xlsxPath}`);
    const header = sheet.getRow(1);
    let column = 0;
    header.eachCell((cell, col) => {
        if (String(cell.value ?? '').trim() === 'Tower #') column = col;
    });
    if (!column) throw new Error('sheet has no "Tower #" column');
    const numbers = new Set();
    for (let row = 2; row <= sheet.rowCount; row += 1) {
        const raw = String(sheet.getCell(row, column).value ?? '').trim();
        if (raw) numbers.add(raw);
    }
    return numbers;
}

async function usaTowerIds() {
    const rows = await prisma.$queryRaw`
        SELECT t.id FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA' ORDER BY t.id
    `;
    return rows.map((row) => row.id);
}

(async () => {
    const backup = arg('--backup');
    if (WRITE && !backup) throw new Error('refusing to delete without --backup <dir>');
    if (WRITE) {
        const manifestPath = path.join(backup, 'manifest.json');
        if (!fs.existsSync(manifestPath)) throw new Error(`no manifest in ${backup}`);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        console.log(`using backup from ${manifest.createdAt} (${manifest.counts.towers} towers recorded)`);
    }

    const xlsxPath = arg('--xlsx', DEFAULT_XLSX);
    const numbers = await sheetTowerNumbers(xlsxPath);
    console.log(`sheet tower numbers: ${numbers.size}`);

    // Resolve the keep-set by the batch tag first, then by Tower # for rows that
    // were refreshed rather than created by the importer.
    const keepRows = await prisma.$queryRaw`
        SELECT t.id, t."rawExcelData"->>'Tower #' AS "towerNumber"
        FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA'
          AND (t."rawExcelData"->>'_batch' = ${BATCH}
               OR t."rawExcelData"->>'Tower #' IS NOT NULL)
    `;
    const keep = new Set(
        keepRows
            .filter((row) => row.towerNumber && numbers.has(row.towerNumber.trim()))
            .map((row) => row.id),
    );
    console.log(`keep (matched to the sheet): ${keep.size}`);

    const allUsa = await usaTowerIds();
    const doomed = allUsa.filter((id) => !keep.has(id));
    const bySource = doomed.length
        ? await prisma.$queryRawUnsafe(
            `SELECT t.source, count(*)::int AS n FROM "Tower" t WHERE t.id = ANY($1::int[]) GROUP BY 1 ORDER BY n DESC`,
            doomed,
        )
        : [];
    console.log(`\nUSA towers: ${allUsa.length}`);
    console.log(`delete: ${doomed.length}`);
    for (const row of bySource) console.log(`  ${row.source}: ${row.n}`);

    const gone = await prisma.$queryRawUnsafe(
        `SELECT
           (SELECT count(*) FROM "BusinessNearby" WHERE "towerId" = ANY($1::int[]))::int AS businesses,
           (SELECT count(*) FROM "Phone" WHERE "towerId" = ANY($1::int[]))::int AS phones,
           (SELECT count(*) FROM "Note" WHERE "towerId" = ANY($1::int[]))::int AS notes,
           (SELECT count(*) FROM "Parcel" WHERE "towerId" = ANY($1::int[]))::int AS parcels`,
        doomed,
    );
    console.log('cascading rows:', JSON.stringify(gone[0]));

    const survivors = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "Parcel" WHERE country = 'Canada'`,
    );
    console.log(`Canadian parcels (must stay ${survivors[0].n}): 0 affected by this scope`);

    if (!WRITE) {
        console.log('\nDry run. Re-run with --write --backup <dir> to delete.');
        return;
    }

    // Parcel.towerId is RESTRICT, so parcels go first. Everything else cascades.
    await prisma.$executeRawUnsafe('DELETE FROM "Parcel" WHERE "towerId" = ANY($1::int[])', doomed);
    const result = await prisma.$executeRawUnsafe('DELETE FROM "Tower" WHERE id = ANY($1::int[])', doomed);
    console.log(`\ndeleted ${result} tower(s)`);

    const after = await prisma.$queryRaw`
        SELECT count(*)::int AS n FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id WHERE p.country = 'USA'
    `;
    const canada = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "Parcel" WHERE country = 'Canada'`;
    console.log(`USA towers now: ${after[0].n}`);
    console.log(`Canadian parcels: ${canada[0].n}`);
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
