// Imports the CellWaves outreach workbook into the Lead table.
// Usage: node scripts/import-cellwaves-leads.js ["/path/to/CellWaves Leads.xlsx"]
// Replaces every existing Lead row, so it is safe to rerun after a sheet update.
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEFAULT_PATH = process.argv[2] || '/Users/kurtcalacday/Downloads/CellWaves Leads.xlsx';

const STAGE_BY_TAB = [
    [/^prospective/i, 'PROSPECTIVE'],
    [/^for later/i, 'LATER_OUTREACH'],
    [/^brett to follow/i, 'NOT_INTERESTED'],
    [/^larrys corner/i, 'LARRYS_CORNER'],
];

const cellText = (cell) => {
    const value = cell.value;
    if (value == null) return null;
    const text = typeof value === 'object' ? (value.text ?? value.result ?? null) : value;
    if (text == null) return null;
    const cleaned = String(text).replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
};

(async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(DEFAULT_PATH);

    const rows = [];
    workbook.worksheets.forEach((sheet) => {
        const match = STAGE_BY_TAB.find(([pattern]) => pattern.test(sheet.name));
        if (!match) {
            console.warn(`Skipping unrecognised tab: ${sheet.name}`);
            return;
        }
        const stage = match[1];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const towerId = Number(row.getCell(1).value);
            if (!Number.isInteger(towerId) || towerId <= 0) return;
            rows.push({
                towerId,
                stage,
                contactPerson: cellText(row.getCell(3)),
                companyName: cellText(row.getCell(4)),
                actions: cellText(row.getCell(5)),
                remarks: cellText(row.getCell(6)),
                brettStatus: cellText(row.getCell(7)),
                emailFollowUp: cellText(row.getCell(8)) !== null,
                sortOrder: rowNumber - 1,
            });
        });
    });

    const towerIds = [...new Set(rows.map((row) => row.towerId))];
    const towers = await prisma.tower.findMany({ where: { id: { in: towerIds } }, select: { id: true } });
    const known = new Set(towers.map((tower) => tower.id));
    const missing = towerIds.filter((id) => !known.has(id));
    const importable = rows.filter((row) => known.has(row.towerId));

    const removed = await prisma.lead.deleteMany({});
    await prisma.lead.createMany({ data: importable });

    console.log(`Read ${rows.length} rows from ${DEFAULT_PATH}`);
    console.log(`Replaced ${removed.count} existing leads with ${importable.length}`);
    console.log(`Unique towers: ${towerIds.length}`);
    if (missing.length > 0) console.warn(`Skipped rows for missing towers: ${missing.join(', ')}`);

    const counts = await prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } });
    console.log('By stage:', Object.fromEntries(counts.map((c) => [c.stage, c._count._all])));
})()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
