/**
 * Promotes the unused USA OpenStreetMap telecom leads into tower records. Safe to
 * re-run: never modifies an existing tower, and only its own rows are tagged so
 * revert-us-osm-promotion.ts can undo it.
 *
 * Dry run by default. Pass --write to apply.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function arg(name: string, fallback = ''): string {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function haversineM(a: number, b: number, c: number, d: number): number {
    const R = 6371000, dLat = (c - a) * Math.PI / 180, dLon = (d - b) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

async function main() {
    const write = process.argv.includes('--write');
    const matchRadius = Number(arg('--match-radius', '400'));
    // OSM does not record lattice vs monopole vs guyed, so promoted rows land in
    // "Other Structure" rather than guessing "Lattice Tower" at 4,032 masts.
    const typeName = arg('--type', 'Other Structure');

    const leads = await prisma.towerLead.findMany({
        where: {
            source: 'OpenStreetMap',
            country: 'USA',
            promotedToTowerId: null,
            tags: { path: ['tower:type'], equals: 'communication' },
        },
        select: {
            id: true, lat: true, lon: true, type: true, sourceId: true,
            province: true, city: true, tags: true,
        },
    });
    console.log(`USA telecom leads awaiting promotion: ${leads.length}`);
    if (!leads.length) {
        console.log('nothing to promote');
        return;
    }

    // Spatial buckets of existing towers, so matching is a local lookup not a full scan.
    const existing = await prisma.tower.findMany({
        where: { lat: { gte: 24, lte: 50 }, lon: { gte: -125, lte: -66 } },
        select: { id: true, lat: true, lon: true },
    });
    console.log(`existing towers in the US bounding box: ${existing.length}`);
    const buckets = new Map<string, { id: number; lat: number; lon: number }[]>();
    const keyOf = (lat: number, lon: number) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
    for (const t of existing) {
        const k = keyOf(t.lat, t.lon);
        const l = buckets.get(k) ?? [];
        l.push(t);
        buckets.set(k, l);
    }

    const takenCoords = new Set<string>();
    const toInsert: typeof leads = [];
    let matched = 0, dupCoord = 0;
    for (const lead of leads) {
        let hit: number | null = null;
        const gl = Math.floor(lead.lat * 2), gn = Math.floor(lead.lon * 2);
        for (let dl = -1; dl <= 1 && hit === null; dl++) {
            for (let dn = -1; dn <= 1 && hit === null; dn++) {
                for (const t of buckets.get(`${gl + dl}_${gn + dn}`) ?? []) {
                    if (haversineM(lead.lat, lead.lon, t.lat, t.lon) <= matchRadius) { hit = t.id; break; }
                }
            }
        }
        if (hit !== null) { matched++; continue; }
        // Tower has a unique lat+lon index: skip rather than silently shifting coordinates.
        const ck = `${lead.lat.toFixed(5)}_${lead.lon.toFixed(5)}`;
        if (takenCoords.has(ck)) { dupCoord++; continue; }
        takenCoords.add(ck);
        toInsert.push(lead);
    }

    const radios = new Map<string, number>();
    for (const l of toInsert) {
        const v = (l.tags as Record<string, string> | null)?.['man_made'] ?? 'unknown';
        radios.set(v, (radios.get(v) || 0) + 1);
    }
    console.log(`matched an existing tower: ${matched} (skipped, no duplicate created)`);
    console.log(`skipped on duplicate coordinates: ${dupCoord}`);
    console.log(`new towers to create: ${toInsert.length}`);
    console.log(`man_made breakdown: ${Array.from(radios.entries()).map(([k, v]) => `${k}=${v}`).join(' ')}`);

    if (!write) {
        console.log('\ndry run. add --write to apply.');
        console.log('  npx tsx --env-file=.env scripts/promote-us-osm-leads.ts --write');
        return;
    }

    // Tower type is resolved once, created only if missing so no migration is needed.
    const typeRow = await prisma.towerType.findFirst({ where: { name: typeName } })
        ?? await prisma.towerType.create({ data: { name: typeName } });
    console.log(`tower type used: ${typeRow.name} (id ${typeRow.id})`);

    // Bulk insert: an interactive transaction holding 500 sequential writes times out
    // against the hosted database (P2028) and rolls the whole batch back.
    const CHUNK = 1000;
    let created = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const res = await prisma.tower.createMany({
            data: chunk.map(lead => ({
                lat: lead.lat,
                lon: lead.lon,
                typeId: typeRow.id,
                source: 'OpenStreetMap (promoted lead)',
                statusId: 1,
                // Keep the OSM tags: they are the only structure evidence these rows have.
                rawImportData: (lead.tags ?? undefined) as never,
            })),
            skipDuplicates: true,
        });
        created += res.count;

        // Link each lead to the tower just created at the identical lat+lon, which is
        // unique on Tower, so the join is exact.
        const ids = chunk.map(l => l.id);
        await prisma.$executeRawUnsafe(
            `UPDATE "TowerLead" l SET "promotedToTowerId" = t.id, "promotedAt" = NOW()
             FROM "Tower" t
             WHERE l.id = ANY($1::int[]) AND t.lat = l.lat AND t.lon = l.lon`,
            ids,
        );
        console.log(`  created ${created}/${toInsert.length}`);
    }

    const total = await prisma.tower.count();
    console.log(`\ncreated ${created} towers from existing USA leads`);
    console.log(`tower table now holds ${total} records`);
    console.log('next: npx tsx --env-file=.env scripts/score-towers.ts');
    console.log('the daily score_towers job will pick up anything this missed');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());