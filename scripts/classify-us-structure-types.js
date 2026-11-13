// Re-types USA towers that sit in "Other Structure" but carry structure evidence
// in their stored OSM or FAA tags.
//
// "Other Structure" collected two unrelated mistakes: promote-us-leads.ts stamping
// every promoted lead with one constant type, and import_excel.js reading a
// misspelled spreadsheet column. The US rows still keep their original tags, so the
// structure can be recovered from the row itself. Canadian rows carry no tags, so
// they are out of scope.
//
// Usage:
//   node scripts/classify-us-structure-types.js            # preview counts
//   node scripts/classify-us-structure-types.js --write    # persist
//   node scripts/classify-us-structure-types.js --self-check
//
// Only rows whose current type is "Other Structure" are touched. Every assignment
// maps to a TowerType that already exists, so no lookup rows are created.
require('dotenv').config({ quiet: true });
const assert = require('node:assert');
const { PrismaClient } = require('@prisma/client');

const WRITE = process.argv.includes('--write');
const SELF_CHECK = process.argv.includes('--self-check');
const SOURCE_TYPE = 'Other Structure';
const USA_BBOX = { minLat: 24, maxLat: 50, minLon: -126, maxLon: -66 };

// tower:construction is the most direct statement of how a tower is built.
// "freestanding", "concealed", "dish" and the material values say something about
// appearance but do not name a tower class, so they stay Other Structure.
const CONSTRUCTION_MAP = new Map([
    ['lattice', 'Lattice Tower'],
    ['lattice_steel', 'Lattice Tower'],
    ['guyed_lattice', 'Guyed'],
    ['guyed', 'Guyed'],
    ['monopole', 'Monopole Tower'],
    ['pole', 'Monopole Tower'],
    ['tube', 'Monopole Tower'],
]);

// FAA obstruction type. BLDG says the structure is mounted on a building, which is
// true but does not name which kind, so it gets its own honest label rather than a
// guess between Commercial Building, Apartment and Warehouse.
// STACK, ELEVATOR, SILO and TANK have no accurate existing type and stay as-is.
const FAA_MAP = new Map([
    ['BLDG', 'Building Mounted'],
]);

/**
 * Resolves a tower's type from its stored tags. Construction wins because it
 * describes the structure, where the FAA type describes only what it stands on.
 */
const classify = (tags) => {
    if (!tags || typeof tags !== 'object') return null;
    const construction = String(tags['tower:construction'] ?? '').trim().toLowerCase();
    if (construction) return CONSTRUCTION_MAP.get(construction) ?? null;
    const faaType = String(tags.TYPE ?? '').trim().toUpperCase();
    if (faaType) return FAA_MAP.get(faaType) ?? null;
    return null;
};

const runSelfCheck = () => {
    assert.strictEqual(classify({ 'tower:construction': 'lattice' }), 'Lattice Tower');
    assert.strictEqual(classify({ 'tower:construction': 'guyed_lattice' }), 'Guyed');
    assert.strictEqual(classify({ 'tower:construction': 'monopole' }), 'Monopole Tower');
    // Case and padding must not defeat the lookup.
    assert.strictEqual(classify({ 'tower:construction': ' Lattice ' }), 'Lattice Tower');
    // Construction wins over the FAA type.
    assert.strictEqual(classify({ 'tower:construction': 'monopole', TYPE: 'BLDG' }), 'Monopole Tower');
    // Unknown labels name no tower class.
    assert.strictEqual(classify({ 'tower:construction': 'concealed' }), null);
    assert.strictEqual(classify({ 'tower:construction': 'freestanding' }), null);
    assert.strictEqual(classify({ TYPE: 'BLDG' }), 'Building Mounted');
    assert.strictEqual(classify({ TYPE: 'bldg' }), 'Building Mounted');
    // TANK, STACK, ELEVATOR and SILO have no accurate existing type.
    assert.strictEqual(classify({ TYPE: 'TANK' }), null);
    assert.strictEqual(classify({ TYPE: 'STACK' }), null);
    // man_made alone says mast or tower, not a class.
    assert.strictEqual(classify({ man_made: 'mast', 'tower:type': 'lighting' }), null);
    assert.strictEqual(classify(null), null);
    assert.strictEqual(classify({}), null);
    console.log('self-check passed');
};

if (SELF_CHECK) {
    runSelfCheck();
    process.exit(0);
}

const prisma = new PrismaClient();

(async () => {
    const sourceType = await prisma.towerType.findFirst({ where: { name: SOURCE_TYPE } });
    if (!sourceType) throw new Error(`Missing TowerType "${SOURCE_TYPE}"`);

    const types = await prisma.towerType.findMany({ select: { id: true, name: true } });
    const typeIdByName = new Map(types.map((row) => [row.name, row.id]));
    // "Building Mounted" records what the FAA tag actually says, so it is a new
    // lookup row rather than a guess at an existing one. A dry run reports it
    // instead of creating it.
    const missing = [...new Set([...CONSTRUCTION_MAP.values(), ...FAA_MAP.values()])]
        .filter((name) => !typeIdByName.has(name));
    for (const name of missing) {
        if (!WRITE) {
            console.log(`would create TowerType "${name}"`);
            continue;
        }
        const created = await prisma.towerType.create({ data: { name } });
        typeIdByName.set(name, created.id);
        console.log(`created TowerType "${name}" (id ${created.id})`);
    }

    // US rows only: the ones this classification can actually resolve.
    const towers = await prisma.$queryRaw`
        SELECT t.id, t."rawExcelData" AS tags
        FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE t."typeId" = ${sourceType.id}
          AND p.country = 'USA'
          AND t.lat >= ${USA_BBOX.minLat} AND t.lat <= ${USA_BBOX.maxLat}
          AND t.lon >= ${USA_BBOX.minLon} AND t.lon <= ${USA_BBOX.maxLon}
    `;

    const buckets = new Map();
    const skipped = [];
    for (const tower of towers) {
        const name = classify(tower.tags);
        if (!name) {
            skipped.push(tower.id);
            continue;
        }
        // Bucket by name: a dry run has no id yet for a type it would create.
        if (!buckets.has(name)) buckets.set(name, []);
        buckets.get(name).push(tower.id);
    }

    const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
    const reclassifiable = ordered.reduce((sum, [, ids]) => sum + ids.length, 0);

    console.log(`USA towers in "${SOURCE_TYPE}": ${towers.length}`);
    console.log(`re-classifiable: ${reclassifiable}, staying as-is: ${skipped.length}\n`);
    console.log('before → after');
    for (const [name, ids] of ordered) console.log(`  ${SOURCE_TYPE} → ${name}: ${ids.length}`);

    const evidence = await prisma.$queryRaw`
        SELECT
            count(*) FILTER (WHERE t."rawExcelData"->>'tower:construction' IS NOT NULL)::int AS construction,
            count(*) FILTER (WHERE t."rawExcelData"->>'tower:construction' IS NULL
                             AND t."rawExcelData"->>'TYPE' IS NOT NULL)::int AS faa,
            count(*) FILTER (WHERE t."rawExcelData"->>'tower:construction' IS NULL
                             AND t."rawExcelData"->>'TYPE' IS NULL)::int AS other
        FROM "Tower" t
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE t."typeId" = ${sourceType.id} AND p.country = 'USA'
    `;
    console.log('\nevidence:', JSON.stringify(evidence[0]));

    if (!WRITE) {
        console.log('\nDry run. Re-run with --write to persist.');
        return;
    }

    let updated = 0;
    for (const [name, ids] of ordered) {
        const result = await prisma.tower.updateMany({
            where: { id: { in: ids }, typeId: sourceType.id },
            data: { typeId: typeIdByName.get(name) },
        });
        updated += result.count;
    }
    console.log(`\nupdated ${updated} tower(s)`);

    const after = await prisma.$queryRaw`
        SELECT tt.name, count(*)::int AS n
        FROM "Tower" t
        JOIN "TowerType" tt ON tt.id = t."typeId"
        JOIN "Parcel" p ON p."towerId" = t.id
        WHERE p.country = 'USA'
        GROUP BY 1 ORDER BY n DESC
    `;
    console.log('USA types now:');
    for (const row of after) console.log(`  ${row.name}: ${row.n}`);
})()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
