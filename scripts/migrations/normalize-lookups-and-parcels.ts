/**
 * One-time (idempotent) data cleanup for filter dropdowns.
 *
 *  1. Merges duplicate Carrier / TowerType / TowerStatus rows that differ only by
 *     case or surrounding whitespace (e.g. "Rogers" / "rogers" / "Rogers "). Towers
 *     (and licensees, for carriers) are reassigned to a single canonical row, the
 *     duplicates are deleted, and the survivor's name is trimmed / best-cased.
 *  2. Trims leading/trailing whitespace from the raw text columns that feed the
 *     city / county / state / zip dropdowns on Parcel and TowerLead.
 *
 * Safe to re-run: after the first pass there are no duplicates or padded values left,
 * so subsequent runs are no-ops.
 *
 * Run with:  npx tsx scripts/migrations/normalize-lookups-and-parcels.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const normalizeKey = (v: string) => v.trim().toLowerCase();

// mixed-case ("Toronto") beats all-caps ("TELUS") beats all-lower ("toronto")
const caseScore = (v: string) => {
    const hasUpper = /[A-Z]/.test(v);
    const hasLower = /[a-z]/.test(v);
    if (hasUpper && hasLower) return 2;
    if (hasUpper) return 1;
    return 0;
};

// Best display name among trimmed variants of the same key.
const bestName = (names: string[]) =>
    names
        .map((n) => n.trim())
        .sort((a, b) => caseScore(b) - caseScore(a) || a.localeCompare(b))[0];

interface LookupRow {
    id: number;
    name: string;
    count: number;
}

/** Group rows by normalized name and decide the canonical survivor for each group. */
function planMerges(rows: LookupRow[]) {
    const groups = new Map<string, LookupRow[]>();
    for (const r of rows) {
        const key = normalizeKey(r.name);
        const group = groups.get(key);
        if (group) group.push(r);
        else groups.set(key, [r]);
    }

    return Array.from(groups.values()).map((list) => {
        // Canonical survivor: most towers, then best-cased name, then lowest id.
        const target = [...list].sort(
            (a, b) => b.count - a.count || caseScore(b.name) - caseScore(a.name) || a.id - b.id
        )[0];
        return {
            targetId: target.id,
            targetName: bestName(list.map((r) => r.name)),
            currentName: target.name,
            sourceIds: list.filter((r) => r.id !== target.id).map((r) => r.id),
        };
    });
}

async function mergeLookup(opts: {
    label: string;
    rows: LookupRow[];
    fk: 'carrierId' | 'typeId' | 'statusId';
    rename: (id: number, name: string) => Promise<unknown>;
    del: (ids: number[]) => Promise<{ count: number }>;
    // Extra FK holders to repoint before deleting (carriers are referenced by Licensee too).
    reassignExtra?: (fromIds: number[], toId: number) => Promise<number>;
}) {
    const plans = planMerges(opts.rows);
    let groupsMerged = 0;
    let towersReassigned = 0;
    let rowsDeleted = 0;
    let namesFixed = 0;

    for (const plan of plans) {
        if (plan.sourceIds.length > 0) {
            const res = await prisma.tower.updateMany({
                where: { [opts.fk]: { in: plan.sourceIds } } as any,
                data: { [opts.fk]: plan.targetId } as any,
            });
            towersReassigned += res.count;

            if (opts.reassignExtra) {
                await opts.reassignExtra(plan.sourceIds, plan.targetId);
            }

            const del = await opts.del(plan.sourceIds);
            rowsDeleted += del.count;
            groupsMerged++;
        }

        if (plan.currentName !== plan.targetName) {
            await opts.rename(plan.targetId, plan.targetName);
            namesFixed++;
        }
    }

    console.log(
        `[${opts.label}] ${opts.rows.length} rows -> merged ${groupsMerged} duplicate group(s), ` +
            `reassigned ${towersReassigned} tower(s), deleted ${rowsDeleted} row(s), trimmed ${namesFixed} name(s).`
    );
}

async function mergeLookups() {
    console.log('--- Merging duplicate lookups (Carrier / TowerType / TowerStatus) ---');

    const carriers = await prisma.carrier.findMany({
        include: { _count: { select: { towers: true } } },
    });
    await mergeLookup({
        label: 'Carrier',
        rows: carriers.map((c) => ({ id: c.id, name: c.name, count: c._count.towers })),
        fk: 'carrierId',
        rename: (id, name) => prisma.carrier.update({ where: { id }, data: { name } }),
        del: (ids) => prisma.carrier.deleteMany({ where: { id: { in: ids } } }),
        reassignExtra: async (fromIds, toId) => {
            const res = await prisma.licensee.updateMany({
                where: { carrierId: { in: fromIds } },
                data: { carrierId: toId },
            });
            return res.count;
        },
    });

    const types = await prisma.towerType.findMany({
        include: { _count: { select: { towers: true } } },
    });
    await mergeLookup({
        label: 'TowerType',
        rows: types.map((t) => ({ id: t.id, name: t.name, count: t._count.towers })),
        fk: 'typeId',
        rename: (id, name) => prisma.towerType.update({ where: { id }, data: { name } }),
        del: (ids) => prisma.towerType.deleteMany({ where: { id: { in: ids } } }),
    });

    const statuses = await prisma.towerStatus.findMany({
        include: { _count: { select: { towers: true } } },
    });
    await mergeLookup({
        label: 'TowerStatus',
        rows: statuses.map((s) => ({ id: s.id, name: s.name, count: s._count.towers })),
        fk: 'statusId',
        rename: (id, name) => prisma.towerStatus.update({ where: { id }, data: { name } }),
        del: (ids) => prisma.towerStatus.deleteMany({ where: { id: { in: ids } } }),
    });
}

/** Trim leading/trailing whitespace on a raw text column, only where it changes. */
async function trimColumn(table: string, column: string) {
    const cleaned = `regexp_replace("${column}", '^\\s+|\\s+$', '', 'g')`;
    const affected = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "${column}" = ${cleaned}
         WHERE "${column}" IS NOT NULL AND "${column}" <> ${cleaned}`
    );
    if (affected > 0) console.log(`[${table}.${column}] trimmed ${affected} value(s).`);
    return affected;
}

async function trimRawFields() {
    console.log('--- Trimming raw location text columns ---');

    // Parcel: note countyRaw is stored in the DB column "county".
    for (const col of ['cityRaw', 'county', 'stateRaw', 'provinceRaw', 'postalCode', 'zip']) {
        await trimColumn('Parcel', col);
    }

    // TowerLead free-text facets.
    for (const col of ['city', 'source', 'type', 'province']) {
        await trimColumn('TowerLead', col);
    }
}

async function main() {
    try {
        await mergeLookups();
        await trimRawFields();
        console.log('Normalization complete.');
    } catch (error) {
        console.error('Script failed:', error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
