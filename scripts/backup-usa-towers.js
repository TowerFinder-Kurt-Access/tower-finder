// Backs up every row that hangs off the USA towers, so a destructive cleanup can
// be undone by replay. Writes one JSON file per table plus a manifest.
//
// Usage:
//   node scripts/backup-usa-towers.js                 # backup
//   node scripts/backup-usa-towers.js --verify DIR    # compare live vs a backup
//
// Rows are paged and appended per table. A single query for the 351k business rows
// exceeds the driver's string limit, so nothing here materialises a whole table.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const OUT_ROOT = path.join(process.cwd(), 'data', 'backups');
const PAGE = 2000;

/** The USA tower id set, resolved once so every query agrees on the scope. */
async function usaTowerIds() {
    const rows = await prisma.$queryRaw`
        SELECT t.id FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA' ORDER BY t.id
    `;
    return rows.map((row) => row.id);
}

/** One page of a table, keyed by tower id. */
const byTowerPage = (table, ids, cursor) => prisma.$queryRawUnsafe(
    `SELECT * FROM "${table}" WHERE "towerId" = ANY($1::int[]) AND id > $2 ORDER BY id LIMIT $3`,
    ids, cursor, PAGE,
);

/** One page of a table, keyed by a named column. */
const byColumnPage = (table, column, ids, cursor) => prisma.$queryRawUnsafe(
    `SELECT * FROM "${table}" WHERE "${column}" = ANY($1::int[]) AND id > $2 ORDER BY id LIMIT $3`,
    ids, cursor, PAGE,
);

/**
 * Streams every page of a query into a JSON array file and returns the count.
 * The array is assembled on disk, so memory stays flat regardless of table size.
 */
async function writeTable(dir, name, fetchPage) {
    const file = path.join(dir, `${name}.json`);
    const fd = fs.openSync(file, 'w');
    fs.writeSync(fd, '[');
    let cursor = 0;
    let count = 0;
    for (;;) {
        const rows = await fetchPage(cursor);
        if (!rows.length) break;
        for (const row of rows) {
            fs.writeSync(fd, `${count ? ',' : ''}${JSON.stringify(row)}`);
            count += 1;
        }
        cursor = rows[rows.length - 1].id;
        if (rows.length < PAGE) break;
        process.stdout.write(`\r  ${name}: ${count}`);
    }
    fs.writeSync(fd, ']');
    fs.closeSync(fd);
    console.log(`\r  ${name}: ${count}`);
    return count;
}

async function buildBackup(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const ids = await usaTowerIds();

    const counts = {};
    counts.towers = await writeTable(dir, 'towers', (c) => prisma.$queryRawUnsafe(
        'SELECT * FROM "Tower" WHERE id = ANY($1::int[]) AND id > $2 ORDER BY id LIMIT $3', ids, c, PAGE,
    ));
    counts.parcels = await writeTable(dir, 'parcels', (c) => byTowerPage('Parcel', ids, c));
    counts.businesses = await writeTable(dir, 'businesses', (c) => byTowerPage('BusinessNearby', ids, c));
    counts.phones = await writeTable(dir, 'phones', (c) => byTowerPage('Phone', ids, c));
    counts.phoneChecks = await writeTable(dir, 'phoneChecks', async (c) => {
        // PhoneCheck hangs off Phone, not Tower: resolve the phone ids first.
        const phones = await prisma.$queryRawUnsafe(
            'SELECT id FROM "Phone" WHERE "towerId" = ANY($1::int[])', ids,
        );
        if (!phones.length) return [];
        return prisma.$queryRawUnsafe(
            'SELECT * FROM "PhoneCheck" WHERE "phoneId" = ANY($1::int[]) AND id > $2 ORDER BY id LIMIT $3',
            phones.map((p) => p.id), c, PAGE,
        );
    });
    counts.notes = await writeTable(dir, 'notes', (c) => byTowerPage('Note', ids, c));
    counts.leads = await writeTable(dir, 'leads', (c) => byTowerPage('Lead', ids, c));
    counts.assignments = await writeTable(dir, 'assignments', (c) => byTowerPage('TowerAssignment', ids, c));
    counts.documents = await writeTable(dir, 'documents', (c) => byTowerPage('TowerDocument', ids, c));
    counts.forms = await writeTable(dir, 'forms', (c) => byTowerPage('CustomerLeadForm', ids, c));
    counts.cellmapper = await writeTable(dir, 'cellmapper', (c) => byTowerPage('CellMapperLog', ids, c));
    counts.promotedLeads = await writeTable(dir, 'promotedLeads', (c) =>
        byColumnPage('TowerLead', 'promotedToTowerId', ids, c));

    // Owners are shared with Canadian parcels: recorded for restore only. The
    // cleanup must never delete an owner row.
    const ownerRows = await prisma.$queryRawUnsafe(
        'SELECT DISTINCT "ownerId" FROM "Parcel" WHERE "towerId" = ANY($1::int[]) AND "ownerId" IS NOT NULL',
        ids,
    );
    const ownerIds = ownerRows.map((row) => row.ownerId);
    counts.owners = await writeTable(dir, 'owners', (c) => prisma.$queryRawUnsafe(
        'SELECT * FROM "Owner" WHERE id = ANY($1::int[]) AND id > $2 ORDER BY id LIMIT $3', ownerIds, c, PAGE,
    ));
    counts.contacts = await writeTable(dir, 'contacts', (c) => byColumnPage('Contact', 'ownerId', ownerIds, c));

    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        createdAt: new Date().toISOString(),
        scope: 'Tower rows whose Parcel.country = USA',
        towerIds: ids.length,
        database: (process.env.POSTGRES_URL || '').replace(/:[^:@]*@/, ':***@'),
        counts,
    }, null, 2));

    return counts;
}

async function liveCounts() {
    const ids = await usaTowerIds();
    const countByTower = async (table) => Number((await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "towerId" = ANY($1::int[])`, ids,
    ))[0].n);
    const ownerRows = await prisma.$queryRawUnsafe(
        'SELECT DISTINCT "ownerId" FROM "Parcel" WHERE "towerId" = ANY($1::int[]) AND "ownerId" IS NOT NULL', ids,
    );
    const ownerIds = ownerRows.map((row) => row.ownerId);
    const phoneRows = await prisma.$queryRawUnsafe(
        'SELECT id FROM "Phone" WHERE "towerId" = ANY($1::int[])', ids,
    );
    return {
        towers: ids.length,
        parcels: await countByTower('Parcel'),
        businesses: await countByTower('BusinessNearby'),
        phones: await countByTower('Phone'),
        phoneChecks: phoneRows.length ? Number((await prisma.$queryRawUnsafe(
            'SELECT count(*)::int AS n FROM "PhoneCheck" WHERE "phoneId" = ANY($1::int[])',
            phoneRows.map((p) => p.id),
        ))[0].n) : 0,
        notes: await countByTower('Note'),
        leads: await countByTower('Lead'),
        assignments: await countByTower('TowerAssignment'),
        documents: await countByTower('TowerDocument'),
        forms: await countByTower('CustomerLeadForm'),
        cellmapper: await countByTower('CellMapperLog'),
        promotedLeads: Number((await prisma.$queryRawUnsafe(
            'SELECT count(*)::int AS n FROM "TowerLead" WHERE "promotedToTowerId" = ANY($1::int[])', ids,
        ))[0].n),
        owners: ownerIds.length,
        contacts: ownerIds.length ? Number((await prisma.$queryRawUnsafe(
            'SELECT count(*)::int AS n FROM "Contact" WHERE "ownerId" = ANY($1::int[])', ownerIds,
        ))[0].n) : 0,
    };
}

(async () => {
    const verifyDirArg = process.argv.indexOf('--verify');
    if (verifyDirArg > -1) {
        const dir = process.argv[verifyDirArg + 1];
        if (!dir) throw new Error('usage: node scripts/backup-usa-towers.js --verify <dir>');
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        const live = await liveCounts();
        let ok = true;
        for (const [table, expected] of Object.entries(manifest.counts)) {
            const actual = live[table];
            if (expected !== actual) {
                ok = false;
                console.log(`FAIL ${table}: backup ${expected}, live ${actual}`);
            } else {
                console.log(`ok   ${table}: ${actual}`);
            }
        }
        console.log(ok ? '\nbackup matches live data' : '\nMISMATCH: do not proceed');
        if (!ok) process.exitCode = 1;
        return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(OUT_ROOT, `usa-towers-${stamp}`);
    console.log(`backing up to ${dir}`);
    const counts = await buildBackup(dir);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\n${total} rows across ${Object.keys(counts).length} tables`);
    console.log(`backup written to ${dir}`);
})().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());
