// Dumps every row of the call sheet with the cells it actually populates, so the
// decision to import a row rests on its contents rather than a row count.
//
// Usage: node scripts/dump-call-sheet-rows.js [fromRow] [toRow]
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');

const SHEET = "/Users/kurtcalacday/Downloads/_ 11. Remake Brett Larry's Cousin Call Sheet new towers only 20260305.xlsx";

(async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(SHEET);
    const sheet = workbook.worksheets[0];
    const names = {};
    sheet.getRow(1).eachCell((cell, col) => { names[col] = String(cell.value ?? '').trim(); });

    const from = Number(process.argv[2]) || 2;
    const to = Number(process.argv[3]) || sheet.rowCount;

    const buckets = { full: 0, placeOnly: 0, notesOnly: 0, blank: 0 };
    const rows = [];

    for (let r = from; r <= to; r += 1) {
        const row = sheet.getRow(r);
        const populated = [];
        row.eachCell({ includeEmpty: false }, (cell, col) => {
            const v = String(cell.value ?? '').trim();
            if (v) populated.push({ col, name: names[col] || '', value: v });
        });
        const get = (c) => populated.find((p) => p.col === c)?.value ?? '';
        const hasCoords = Boolean(get(18) && get(19));
        const hasPlace = Boolean(get(11) || get(12) || get(13) || get(14));
        const hasId = Boolean(get(5) || get(6) || get(22) || get(32));

        let kind;
        if (!populated.length) kind = 'blank';
        else if (hasCoords) kind = 'full';
        else if (hasPlace || hasId) kind = 'placeOnly';
        else kind = 'notesOnly';
        buckets[kind] += 1;

        rows.push({ r, kind, cells: populated.length, hidden: Boolean(row.hidden), sample: populated.slice(0, 6) });
    }

    console.log(`rows ${from}-${to}`);
    console.log(`buckets: ${JSON.stringify(buckets)}`);
    console.log('\n--- non-blank rows without coordinates ---');
    for (const row of rows.filter((x) => x.kind === 'placeOnly' || x.kind === 'notesOnly')) {
        console.log(`row ${row.r} [${row.kind}] hidden=${row.hidden} cells=${row.cells}`);
        for (const c of row.sample) console.log(`    c${c.col} ${c.name || '(unnamed)'} = ${c.value.slice(0, 50)}`);
    }
    console.log('\n--- blank row numbers ---');
    console.log(rows.filter((x) => x.kind === 'blank').map((x) => x.r).join(', ') || 'none');
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
});
