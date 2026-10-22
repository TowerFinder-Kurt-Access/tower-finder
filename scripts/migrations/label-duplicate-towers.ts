/**
 * Label duplicate towers (one physical site imported twice), and undo it.
 *
 * Rule: towers that share a Parcel address in the same province and sit within
 * --max-separation metres of each other are the same site. Each cluster of such
 * rows keeps one keeper row; the other rows get the "Duplicate Tower" status and
 * a note pointing at the keeper. A human status is never overwritten.
 *
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts                    # dry run
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --write            # label + backup
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore          # show the undo plan
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore --write  # undo the newest backup
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore <file> --write
 *
 * Flags: --provinces=ON,AB (default: every province), --max-separation=25
 *
 * Every write run drops a backup in data/dupes/ before it changes anything.
 * Restore reads the newest backup unless a path follows --restore. See docs/restore.md.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not set. Run with: npx tsx --env-file=.env <this script>');
}

const prisma = new PrismaClient();

const LABEL_NAME = 'Duplicate Tower';
const NEW_STATUS_NAME = 'New';
const NOTE_PREFIX = 'Duplicate of tower #';
const BACKUP_DIR = path.join(process.cwd(), 'data', 'dupes');
const REPORT_FILE = path.join(BACKUP_DIR, 'far-apart-latest.json');
const EARTH_RADIUS_M = 6371000;

const args = process.argv.slice(2);
const shouldWrite = args.includes('--write');
const restoreIndex = args.indexOf('--restore');
const restoreFlag = restoreIndex >= 0;
const restoreCandidate = restoreFlag ? args[restoreIndex + 1] : undefined;
const restorePath = restoreCandidate && !restoreCandidate.startsWith('--') ? restoreCandidate : undefined;
const provincesArg = args.find((a) => a.startsWith('--provinces='));
const provinces = provincesArg
    ? provincesArg.slice('--provinces='.length).split(',').map((p) => p.trim().toUpperCase()).filter(Boolean)
    : null;
const separationArg = args.find((a) => a.startsWith('--max-separation='));
const maxSeparationM = separationArg ? Number(separationArg.slice('--max-separation='.length)) : 25;

interface Row {
    id: number;
    province: string;
    address: string;
    lat: number;
    lon: number;
    statusId: number | null;
    statusName: string | null;
    notes: number;
    assignments: number;
    humanLabel: string | null;
    ownerId: number | null;
}

interface Cluster {
    province: string;
    address: string;
    keeper: Row;
    members: Row[];
    closestM: number;
    spreadM: number;
}

interface LabelAction {
    row: Row;
    keeperId: number;
}

interface UnlabelAction {
    row: Row;
    keeperId: number;
    previousStatusId: number | null;
}

interface Plan {
    toLabel: LabelAction[];
    toUnlabel: UnlabelAction[];
    keepHuman: LabelAction[];
    noteTargets: LabelAction[];
    keepers: Row[];
    clusters: Cluster[];
    farGroups: { province: string; address: string; rowIds: number[]; nearestM: number }[];
}

interface BackupRow {
    id: number;
    province: string;
    address: string;
    keeperId: number;
    previousStatusId: number | null;
    updatedAtBefore: string;
    updatedAtAfter: string | null;
}

interface BackupUnlabelRow {
    id: number;
    keeperId: number;
    restoredStatusId: number | null;
    updatedAtBefore: string;
    updatedAtAfter: string | null;
}

interface BackupNote {
    id: number;
    towerId: number;
    content: string;
    previousContent: string | null;
    deleted: boolean;
}

interface Backup {
    createdAt: string;
    action: string;
    label: { id: number; name: string };
    provinces: string[] | null;
    maxSeparationM: number;
    rule: string;
    rows: BackupRow[];
    unlabelled: BackupUnlabelRow[];
    notes: BackupNote[];
}

function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Human work on a row: a status a person set, notes, an assignment, a label, an owner. */
function keeperScore(row: Row): number {
    let score = 0;
    const status = row.statusName ?? '';
    if (row.statusId !== null && status !== NEW_STATUS_NAME && status !== LABEL_NAME) score += 8;
    if (row.notes > 0) score += 4;
    if (row.assignments > 0) score += 2;
    if (row.humanLabel) score += 1;
    if (row.ownerId !== null) score += 1;
    return score;
}

/** Every tower that shares a Parcel address with at least one other tower. */
async function selectRows(): Promise<Row[]> {
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
        WITH t AS (
            SELECT tw.id,
                   p."provinceRaw" AS province,
                   lower(btrim(p.address)) AS address,
                   tw.lat,
                   tw.lon,
                   tw."statusId" AS "statusId",
                   ts.name AS "statusName",
                   tw."humanLabel" AS "humanLabel",
                   p."ownerId" AS "ownerId"
            FROM "Tower" tw
            JOIN "Parcel" p ON p."towerId" = tw.id
            LEFT JOIN "TowerStatus" ts ON ts.id = tw."statusId"
            WHERE p.address IS NOT NULL
              AND btrim(p.address) <> ''
              ${provinces ? Prisma.sql`AND p."provinceRaw" IN (${Prisma.join(provinces)})` : Prisma.empty}
        ), g AS (
            SELECT province, address FROM t GROUP BY 1, 2 HAVING count(*) > 1
        )
        SELECT t.id, t.province, t.address, t.lat, t.lon, t."statusId", t."statusName",
               t."humanLabel", t."ownerId",
               COALESCE(n.notes, 0)::int AS notes,
               COALESCE(a.assignments, 0)::int AS assignments
        FROM t
        JOIN g ON g.province = t.province AND g.address = t.address
        LEFT JOIN (SELECT "towerId", count(*) AS notes FROM "Note" WHERE content NOT LIKE ${`${NOTE_PREFIX}%`} GROUP BY 1) n ON n."towerId" = t.id
        LEFT JOIN (SELECT "towerId", count(*) AS assignments FROM "TowerAssignment" GROUP BY 1) a ON a."towerId" = t.id
        ORDER BY t.province, t.address, t.id
    `);

    return rows.map((r) => ({
        ...r,
        notes: Number(r.notes),
        assignments: Number(r.assignments),
        lat: Number(r.lat),
        lon: Number(r.lon),
    }));
}

/** Rows this script labeled before, with the status each one had before. */
function previousStatusByRow(): Map<number, number | null> {
    const map = new Map<number, number | null>();
    if (!fs.existsSync(BACKUP_DIR)) return map;
    const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('dupe-label-') && f.endsWith('.json'))
        .sort();
    for (const file of files) {
        const backup = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), 'utf8')) as Backup;
        for (const row of backup.rows ?? []) {
            map.set(row.id, row.previousStatusId ?? null);
        }
    }
    return map;
}

function buildPlan(rows: Row[], previousStatus: Map<number, number | null>): Plan {
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
        const key = `${row.province}\u0000${row.address}`;
        const list = groups.get(key);
        if (list) list.push(row);
        else groups.set(key, [row]);
    }

    const toLabel: LabelAction[] = [];
    const toUnlabel: UnlabelAction[] = [];
    const keepHuman: LabelAction[] = [];
    const noteTargets: LabelAction[] = [];
    const keepers: Row[] = [];
    const clusters: Cluster[] = [];
    const farGroups: Plan['farGroups'] = [];

    for (const members of groups.values()) {
        const edges: [number, number, number][] = [];
        let closest = Infinity;
        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                const d = distanceM(members[i].lat, members[i].lon, members[j].lat, members[j].lon);
                if (d < closest) closest = d;
                if (d <= maxSeparationM) edges.push([i, j, d]);
            }
        }

        if (closest > maxSeparationM) {
            farGroups.push({
                province: members[0].province,
                address: members[0].address,
                rowIds: members.map((m) => m.id),
                nearestM: Math.round(closest),
            });
            continue;
        }

        // Connected components of the "within tolerance" graph.
        const parent = members.map((_, i) => i);
        const find = (x: number): number => {
            let root = x;
            while (parent[root] !== root) root = parent[root];
            while (parent[x] !== root) {
                const next = parent[x];
                parent[x] = root;
                x = next;
            }
            return root;
        };
        const union = (a: number, b: number): void => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) parent[rb] = ra;
        };
        for (const [i, j] of edges) union(i, j);

        const byRoot = new Map<number, number[]>();
        members.forEach((_, i) => {
            const root = find(i);
            const list = byRoot.get(root);
            if (list) list.push(i);
            else byRoot.set(root, [i]);
        });

        for (const indices of byRoot.values()) {
            if (indices.length < 2) continue;
            const group = indices.map((i) => members[i]);
            const keeper = group
                .slice()
                .sort((a, b) => keeperScore(b) - keeperScore(a) || a.id - b.id)[0];
            const others = group.filter((m) => m.id !== keeper.id);

            const clusterDistances = edges
                .filter(([i, j]) => indices.includes(i) && indices.includes(j))
                .map(([, , d]) => d);
            clusters.push({
                province: keeper.province,
                address: keeper.address,
                keeper,
                members: group,
                closestM: Math.min(...clusterDistances),
                spreadM: Math.max(...clusterDistances),
            });

            keepers.push(keeper);

            for (const other of others) {
                const status = other.statusName ?? '';
                if (other.statusId !== null && status !== NEW_STATUS_NAME && status !== LABEL_NAME) {
                    keepHuman.push({ row: other, keeperId: keeper.id });
                    continue;
                }
                noteTargets.push({ row: other, keeperId: keeper.id });
                if (status !== LABEL_NAME) toLabel.push({ row: other, keeperId: keeper.id });
            }

            // A keeper that carries the label from an earlier run gives the label back.
            if (keeper.statusName === LABEL_NAME) {
                const previous = previousStatus.get(keeper.id);
                if (previous !== undefined) {
                    toUnlabel.push({ row: keeper, keeperId: keeper.id, previousStatusId: previous });
                } else {
                    keepHuman.push({ row: keeper, keeperId: keeper.id });
                }
            }
        }
    }

    return { toLabel, toUnlabel, keepHuman, noteTargets, keepers, clusters, farGroups };
}

/** Which labelled rows still need the note that points at their keeper. */
async function planNotes(targets: LabelAction[], keepers: Row[]): Promise<{
    existing: Map<number, { id: number; content: string }[]>;
    stale: { id: number; towerId: number; content: string; previousContent: string }[];
    missing: { towerId: number; content: string }[];
    onKeeper: { id: number; towerId: number; content: string }[];
}> {
    const empty = { existing: new Map(), stale: [], missing: [], onKeeper: [] };
    if (targets.length === 0 && keepers.length === 0) return empty;

    const towerIds = [...targets.map((t) => t.row.id), ...keepers.map((k) => k.id)];
    const notes = await prisma.$queryRaw<{ id: number; towerId: number; content: string }[]>(Prisma.sql`
        SELECT id, "towerId", content FROM "Note"
        WHERE "towerId" IN (${Prisma.join(towerIds)}) AND content LIKE ${`${NOTE_PREFIX}%`}
    `);

    const existing = new Map<number, { id: number; content: string }[]>();
    for (const note of notes) {
        const list = existing.get(note.towerId) ?? [];
        list.push({ id: note.id, content: note.content });
        existing.set(note.towerId, list);
    }

    const stale: { id: number; towerId: number; content: string; previousContent: string }[] = [];
    const missing: { towerId: number; content: string }[] = [];
    for (const target of targets) {
        const content = `${NOTE_PREFIX}${target.keeperId}`;
        const found = existing.get(target.row.id) ?? [];
        if (found.some((n) => n.content === content)) continue;
        const previous = found[0];
        if (previous) {
            stale.push({ id: previous.id, towerId: target.row.id, content, previousContent: previous.content });
        } else {
            missing.push({ towerId: target.row.id, content });
        }
    }

    // A keeper that still carries the note of an earlier run points at a row that is
    // no longer its keeper. The note goes; the row is not a duplicate.
    const keeperIds = new Set(keepers.map((k) => k.id));
    const onKeeper = notes
        .filter((note) => keeperIds.has(note.towerId))
        .map((note) => ({ id: note.id, towerId: note.towerId, content: note.content }));

    return { existing, stale, missing, onKeeper };
}

async function findStatus(name: string): Promise<{ id: number; name: string } | null> {
    const status = await prisma.towerStatus.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
    });
    return status;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function writeJson(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function newestBackup(): string {
    if (!fs.existsSync(BACKUP_DIR)) throw new Error(`No backup directory at ${BACKUP_DIR}`);
    const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('dupe-label-') && f.endsWith('.json'))
        .sort();
    if (files.length === 0) throw new Error(`No backup file in ${BACKUP_DIR}`);
    return path.join(BACKUP_DIR, files[files.length - 1]);
}

function summarise(label: string, rows: { row: Row }[]): void {
    const byProvince = new Map<string, number>();
    for (const item of rows) byProvince.set(item.row.province, (byProvince.get(item.row.province) ?? 0) + 1);
    const text = [...byProvince.entries()].map(([p, n]) => `${p} ${n}`).join(', ') || 'none';
    console.log(`${label}: ${rows.length} rows (${text})`);
}

async function label(): Promise<void> {
    const status = await findStatus(LABEL_NAME);
    if (!status) throw new Error(`TowerStatus "${LABEL_NAME}" is missing. Create it before labelling.`);
    const newStatus = await findStatus(NEW_STATUS_NAME);

    const rows = await selectRows();
    const previousStatus = previousStatusByRow();
    const plan = buildPlan(rows, previousStatus);
    const notes = await planNotes(plan.noteTargets, plan.keepers);

    console.log(`label status: ${status.id} "${status.name}"`);
    console.log(`provinces: ${provinces ? provinces.join(', ') : 'all'}, max separation: ${maxSeparationM} m`);
    console.log(`rows sharing an address: ${rows.length}, clusters: ${plan.clusters.length}`);
    console.log('');

    summarise('to label', plan.toLabel);
    summarise('keeper gives the label back', plan.toUnlabel);
    summarise('left alone, a person already judged it', plan.keepHuman);
    console.log(`notes to write: ${notes.missing.length}, notes to repoint: ${notes.stale.length}, notes on keepers to remove: ${notes.onKeeper.length}`);
    console.log(`same address but further apart than ${maxSeparationM} m: ${plan.farGroups.length} addresses`);

    console.log('\nfirst clusters:');
    for (const cluster of plan.clusters.slice(0, 10)) {
        console.log(
            `  ${cluster.province} ${cluster.closestM.toFixed(1)} m  keeper ${cluster.keeper.id}  ` +
            `members ${cluster.members.map((m) => m.id).join(',')}  ${cluster.address.slice(0, 60)}`
        );
    }

    const work =
        plan.toLabel.length +
        plan.toUnlabel.length +
        notes.missing.length +
        notes.stale.length +
        notes.onKeeper.length;
    if (work === 0) {
        console.log('\nNothing to do.');
        if (shouldWrite) writeReport(plan);
        return;
    }
    if (!shouldWrite) {
        console.log('\nDry run. Re-run with --write to apply.');
        return;
    }

    const backupFile = path.join(BACKUP_DIR, `dupe-label-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const touchedIds = [...plan.toLabel.map((a) => a.row.id), ...plan.toUnlabel.map((a) => a.row.id)];
    const before = await prisma.tower.findMany({
        where: { id: { in: touchedIds } },
        select: { id: true, updatedAt: true },
    });
    const beforeById = new Map(before.map((r) => [r.id, r.updatedAt.toISOString()]));

    const backup: Backup = {
        createdAt: new Date().toISOString(),
        action: 'label-duplicate-towers',
        label: status,
        provinces,
        maxSeparationM,
        rule: `same Parcel address within ${maxSeparationM} m; one keeper per cluster, the rest get "${LABEL_NAME}"`,
        rows: plan.toLabel.map((a) => ({
            id: a.row.id,
            province: a.row.province,
            address: a.row.address,
            keeperId: a.keeperId,
            previousStatusId: a.row.statusId,
            updatedAtBefore: beforeById.get(a.row.id) ?? '',
            updatedAtAfter: null,
        })),
        unlabelled: plan.toUnlabel.map((a) => ({
            id: a.row.id,
            keeperId: a.keeperId,
            restoredStatusId: a.previousStatusId,
            updatedAtBefore: beforeById.get(a.row.id) ?? '',
            updatedAtAfter: null,
        })),
        notes: [],
    };
    writeJson(backupFile, backup);
    console.log(`\nbackup before any write: ${path.relative(process.cwd(), backupFile)}`);

    for (const ids of chunk(plan.toLabel.map((a) => a.row.id), 1000)) {
        const result = await prisma.tower.updateMany({
            where: {
                id: { in: ids },
                ...(newStatus ? { OR: [{ statusId: null }, { statusId: newStatus.id }] } : { statusId: null }),
            },
            data: { statusId: status.id },
        });
        console.log(`  ${result.count} of ${ids.length} rows in this chunk took the label`);
    }

    const unlabelGroups = new Map<string, number[]>();
    for (const action of plan.toUnlabel) {
        const key = String(action.previousStatusId ?? 'null');
        const list = unlabelGroups.get(key);
        if (list) list.push(action.row.id);
        else unlabelGroups.set(key, [action.row.id]);
    }
    for (const [key, ids] of unlabelGroups) {
        const previousStatusId = key === 'null' ? null : Number(key);
        const result = await prisma.tower.updateMany({
            where: { id: { in: ids }, statusId: status.id },
            data: { statusId: previousStatusId },
        });
        console.log(`  ${result.count} of ${ids.length} keepers gave the label back (status ${key})`);
    }

    const existingNoteIds = new Set<number>();
    for (const list of notes.existing.values()) {
        for (const note of list) existingNoteIds.add(note.id);
    }

    if (notes.stale.length > 0) {
        for (const note of notes.stale) {
            await prisma.note.update({ where: { id: note.id }, data: { content: note.content } });
        }
        console.log(`  notes repointed: ${notes.stale.length}`);
    }
    if (notes.missing.length > 0) {
        await prisma.note.createMany({
            data: notes.missing.map((m) => ({ towerId: m.towerId, content: m.content, authorId: null })),
        });
        console.log(`  notes written: ${notes.missing.length}`);
    }

    const deletedNotes: BackupNote[] = [];
    for (const note of notes.onKeeper) {
        const current = await prisma.note.findUnique({ where: { id: note.id } });
        if (!current || current.content !== note.content) continue;
        await prisma.note.delete({ where: { id: note.id } });
        deletedNotes.push({ ...note, previousContent: null, deleted: true });
    }
    if (deletedNotes.length > 0) console.log(`  notes removed from keepers: ${deletedNotes.length}`);

    const targetIds = plan.noteTargets.map((t) => t.row.id);
    const written = targetIds.length
        ? await prisma.$queryRaw<{ id: number; towerId: number; content: string }[]>(Prisma.sql`
            SELECT id, "towerId", content FROM "Note"
            WHERE "towerId" IN (${Prisma.join(targetIds)}) AND content LIKE ${`${NOTE_PREFIX}%`}
        `)
        : [];
    backup.notes = [
        ...deletedNotes,
        ...written
            .filter((note) => !existingNoteIds.has(note.id) || notes.stale.some((s) => s.id === note.id))
            .map((note) => {
                const stale = notes.stale.find((s) => s.id === note.id);
                return {
                    id: note.id,
                    towerId: note.towerId,
                    content: note.content,
                    previousContent: stale ? stale.previousContent : null,
                    deleted: false,
                };
            }),
    ];

    const after = await prisma.tower.findMany({
        where: { id: { in: touchedIds } },
        select: { id: true, statusId: true, updatedAt: true },
    });
    const afterById = new Map(after.map((r) => [r.id, r]));
    backup.rows = backup.rows.map((row) => {
        const now = afterById.get(row.id);
        if (!now || now.statusId !== status.id) throw new Error(`row ${row.id} did not take the label`);
        return { ...row, updatedAtAfter: now.updatedAt.toISOString() };
    });
    backup.unlabelled = backup.unlabelled.map((row) => {
        const now = afterById.get(row.id);
        return { ...row, updatedAtAfter: now ? now.updatedAt.toISOString() : null };
    });
    writeJson(backupFile, backup);
    console.log(`backup stamped with the new timestamps: ${path.relative(process.cwd(), backupFile)}`);

    writeReport(plan);
}

function writeReport(plan: Plan): void {
    writeJson(REPORT_FILE, {
        createdAt: new Date().toISOString(),
        maxSeparationM,
        rule: 'same Parcel address, nearest tower further apart than maxSeparationM',
        groups: plan.farGroups,
    });
    console.log(`same-address report: ${path.relative(process.cwd(), REPORT_FILE)} (${plan.farGroups.length} addresses)`);
}

async function restore(backupPath: string): Promise<void> {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as Backup;
    console.log(`backup: ${backupPath}`);
    console.log(`created ${backup.createdAt}, label ${backup.label.id} "${backup.label.name}", ${backup.rows.length} rows`);

    const current = await prisma.tower.findMany({
        where: { id: { in: [...backup.rows.map((r) => r.id), ...(backup.unlabelled ?? []).map((r) => r.id)] } },
        select: { id: true, statusId: true, updatedAt: true },
    });
    const byId = new Map(current.map((r) => [r.id, r]));

    const revert: BackupRow[] = [];
    const skipped: string[] = [];
    for (const row of backup.rows) {
        const now = byId.get(row.id);
        if (!now) {
            skipped.push(`id ${row.id}: row is gone`);
            continue;
        }
        if (now.statusId !== backup.label.id) {
            skipped.push(`id ${row.id}: status is now ${now.statusId}, not the label`);
            continue;
        }
        if (row.updatedAtAfter && now.updatedAt.toISOString() !== row.updatedAtAfter) {
            skipped.push(`id ${row.id}: edited after the label`);
            continue;
        }
        revert.push(row);
    }

    // A row the run labelled and later took the label back from is in both sets. The
    // revert already puts it back to its own status, so it must not be relabelled.
    const revertIds = new Set(backup.rows.map((r) => r.id));
    const relabel: BackupUnlabelRow[] = [];
    for (const row of backup.unlabelled ?? []) {
        const now = byId.get(row.id);
        if (!now) continue;
        if (revertIds.has(row.id)) continue;
        if (now.statusId !== row.restoredStatusId) {
            skipped.push(`id ${row.id}: status is now ${now.statusId}, not ${row.restoredStatusId}`);
            continue;
        }
        relabel.push(row);
    }

    console.log(`can revert: ${revert.length}, can relabel: ${relabel.length}, skipped: ${skipped.length}`);
    for (const note of skipped.slice(0, 15)) console.log(`  ${note}`);
    if (skipped.length > 15) console.log(`  ... and ${skipped.length - 15} more`);

    if (!shouldWrite) {
        console.log('\nDry run. Re-run with --restore --write to apply.');
        return;
    }

    const revertGroups = new Map<string, number[]>();
    for (const row of revert) {
        const key = String(row.previousStatusId ?? 'null');
        const list = revertGroups.get(key);
        if (list) list.push(row.id);
        else revertGroups.set(key, [row.id]);
    }
    for (const [key, ids] of revertGroups) {
        const previousStatusId = key === 'null' ? null : Number(key);
        const result = await prisma.tower.updateMany({
            where: { id: { in: ids }, statusId: backup.label.id },
            data: { statusId: previousStatusId },
        });
        console.log(`  reverted ${result.count} of ${ids.length} rows to status ${key}`);
    }

    for (const ids of chunk(relabel.map((r) => r.id), 1000)) {
        const result = await prisma.tower.updateMany({
            where: { id: { in: ids } },
            data: { statusId: backup.label.id },
        });
        console.log(`  relabelled ${result.count} of ${ids.length} keepers`);
    }

    let notesRestored = 0;
    let notesDeleted = 0;
    const toDelete: number[] = [];
    const toRecreate: { id: number; towerId: number; content: string }[] = [];
    const contentUpdates = new Map<string, number[]>();
    for (const note of backup.notes ?? []) {
        if (note.deleted) {
            toRecreate.push({ id: note.id, towerId: note.towerId, content: note.content });
        } else if (note.previousContent) {
            const list = contentUpdates.get(note.previousContent) ?? [];
            list.push(note.id);
            contentUpdates.set(note.previousContent, list);
        } else {
            toDelete.push(note.id);
        }
    }

    // Only touch a note that still carries the content the run wrote.
    const noteIds = [...toDelete, ...[...contentUpdates.values()].flat(), ...(backup.notes ?? []).filter((n) => n.deleted).map((n) => n.id)];
    const currentNotes = noteIds.length
        ? await prisma.note.findMany({ where: { id: { in: noteIds } }, select: { id: true, content: true } })
        : [];
    const contentById = new Map(currentNotes.map((n) => [n.id, n.content]));

    const deleteIds = toDelete.filter((id) => {
        const expected = (backup.notes ?? []).find((n) => n.id === id)?.content;
        return contentById.get(id) === expected;
    });
    for (const ids of chunk(deleteIds, 1000)) {
        const result = await prisma.note.deleteMany({ where: { id: { in: ids } } });
        notesDeleted += result.count;
    }

    for (const [previousContent, ids] of contentUpdates) {
        const matchIds = ids.filter((id) => {
            const expected = (backup.notes ?? []).find((n) => n.id === id)?.content;
            return contentById.get(id) === expected;
        });
        for (const group of chunk(matchIds, 1000)) {
            const result = await prisma.note.updateMany({
                where: { id: { in: group } },
                data: { content: previousContent },
            });
            notesRestored += result.count;
        }
    }

    const recreate = toRecreate.filter((note) => !contentById.has(note.id));
    if (recreate.length > 0) {
        await prisma.note.createMany({
            data: recreate.map((n) => ({ towerId: n.towerId, content: n.content, authorId: null })),
        });
        notesRestored += recreate.length;
    }
    console.log(`  notes deleted: ${notesDeleted}, notes restored: ${notesRestored}`);

    const left = await prisma.tower.count({ where: { id: { in: backup.rows.map((r) => r.id) }, statusId: backup.label.id } });
    console.log(`rows from this backup still carrying the label: ${left}`);
}

async function main(): Promise<void> {
    const file = restoreFlag ? restorePath ?? newestBackup() : '';
    if (restoreFlag) {
        await restore(file);
    } else {
        await label();
    }
}

main()
    .catch((error) => {
        console.error('Script failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
