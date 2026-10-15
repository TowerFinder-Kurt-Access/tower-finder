/**
 * Label un-reviewed duplicate towers, and undo it.
 *
 * Rule: a tower with no status that shares a Parcel address with another tower in the
 * same province is a duplicate. This script gives every such row the "Duplicate Tower"
 * status. It never touches notes, owners, parcels, or the text `status` column, and it
 * never deletes a row.
 *
 * Groups whose rows sit further apart than --max-separation are left alone and written
 * to a separate report instead. Two towers on one property can share an address.
 *
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts                    # dry run
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --write            # label + backup
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore          # show the undo plan
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore --write  # undo the newest backup
 *   npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore <file> --write
 *
 * Flags: --provinces=ON,AB (default ON,AB), --max-separation=50
 *
 * Every write run drops a backup in data/dupes/ before it changes anything. Restore reads
 * the newest backup unless a path follows --restore. See docs/restore.md.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not set. Run with: npx tsx --env-file=.env <this script>');
}

const prisma = new PrismaClient();

const LABEL_NAME = 'Duplicate Tower';
const BACKUP_DIR = path.join(process.cwd(), 'data', 'dupes');
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
    : ['ON', 'AB'];
const separationArg = args.find((a) => a.startsWith('--max-separation='));
const maxSeparationM = separationArg ? Number(separationArg.slice('--max-separation='.length)) : 50;

interface Candidate {
    id: number;
    province: string;
    address: string;
    previousStatusId: number | null;
    groupSize: number;
    spreadM: number;
}

interface BackupRow {
    id: number;
    province: string;
    address: string;
    previousStatusId: number | null;
    updatedAtBefore: string;
    updatedAtAfter: string | null;
}

interface Backup {
    createdAt: string;
    action: string;
    label: { id: number; name: string };
    provinces: string[];
    maxSeparationM: number;
    rule: string;
    rows: BackupRow[];
}

interface LabeledGroup {
    province: string;
    address: string;
    spreadM: number;
    rowIds: number[];
}

/** Untouched towers whose province and address are shared with at least one other tower. */
async function selectCandidates(provinceList: string[]): Promise<Candidate[]> {
    const rows = await prisma.$queryRaw<
        {
            id: number;
            province: string;
            address: string;
            previous_status_id: number | null;
            group_size: bigint;
            span_m: number;
        }[]
    >(Prisma.sql`
        WITH t AS (
            SELECT tw.id,
                   p."provinceRaw" AS province,
                   lower(btrim(p.address)) AS address,
                   tw."statusId" AS previous_status_id,
                   tw.lat,
                   tw.lon
            FROM "Tower" tw
            JOIN "Parcel" p ON p."towerId" = tw.id
            WHERE p."provinceRaw" IN (${Prisma.join(provinceList)})
              AND p.address IS NOT NULL
              AND btrim(p.address) <> ''
        ),
        g AS (
            SELECT province,
                   address,
                   count(*) AS group_size,
                   max(lat) AS max_lat,
                   min(lat) AS min_lat,
                   max(lon) AS max_lon,
                   min(lon) AS min_lon
            FROM t
            GROUP BY 1, 2
        )
        SELECT t.id,
               t.province,
               t.address,
               t.previous_status_id,
               g.group_size,
               /* Longest side of the group's bounding box: an upper bound on the real spread. */
               sqrt(
                   power(g.max_lat - g.min_lat, 2) +
                   power((g.max_lon - g.min_lon) * cos(radians((g.max_lat + g.min_lat) / 2)), 2)
               ) * ${EARTH_RADIUS_M} AS span_m
        FROM t
        JOIN g ON g.province = t.province AND g.address = t.address
        WHERE g.group_size >= 2
          AND t.previous_status_id IS NULL
        ORDER BY t.province, t.address, t.id
    `);

    return rows.map((r) => ({
        id: r.id,
        province: r.province,
        address: r.address,
        previousStatusId: r.previous_status_id,
        groupSize: Number(r.group_size),
        spreadM: Number(r.span_m),
    }));
}

async function findLabelStatus(): Promise<{ id: number; name: string }> {
    const status = await prisma.towerStatus.findFirst({
        where: { name: { equals: LABEL_NAME, mode: 'insensitive' } },
    });
    if (!status) {
        throw new Error(`TowerStatus "${LABEL_NAME}" is missing. Create it before labelling.`);
    }
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

function summarise(label: string, rows: Candidate[]): void {
    const byProvince = new Map<string, number>();
    for (const row of rows) byProvince.set(row.province, (byProvince.get(row.province) ?? 0) + 1);
    const sizes = new Map<number, number>();
    const seen = new Set<string>();
    for (const row of rows) {
        const key = `${row.province}\u0000${row.address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sizes.set(row.groupSize, (sizes.get(row.groupSize) ?? 0) + 1);
    }
    const provinceText = [...byProvince.entries()].map(([p, n]) => `${p} ${n}`).join(', ') || 'none';
    const sizeText = [...sizes.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s} rows: ${n}`).join(', ') || 'none';
    console.log(`${label}: ${rows.length} rows in ${seen.size} addresses (${provinceText})`);
    console.log(`  group sizes: ${sizeText}`);
}

async function label(): Promise<void> {
    const status = await findLabelStatus();
    const candidates = await selectCandidates(provinces);
    const toLabel = candidates.filter((r) => r.spreadM <= maxSeparationM);
    const farApart = candidates.filter((r) => r.spreadM > maxSeparationM);

    console.log(`label status: ${status.id} "${status.name}"`);
    console.log(`provinces: ${provinces.join(', ')}, max group spread: ${maxSeparationM} m`);
    console.log('');
    summarise('to label', toLabel);
    summarise('held back, spread too wide', farApart);

    const reportFile = path.join(BACKUP_DIR, 'far-apart-latest.json');
    const report: LabeledGroup[] = [];
    const reportSeen = new Set<string>();
    for (const row of farApart) {
        const key = `${row.province}\u0000${row.address}`;
        if (reportSeen.has(key)) continue;
        reportSeen.add(key);
        const rowIds = farApart.filter((r) => r.province === row.province && r.address === row.address).map((r) => r.id);
        report.push({ province: row.province, address: row.address, spreadM: Math.round(row.spreadM), rowIds });
    }
    writeJson(reportFile, { createdAt: new Date().toISOString(), maxSeparationM, groups: report });
    console.log(`\nfurthest-apart report: ${path.relative(process.cwd(), reportFile)} (${report.length} addresses)`);
    for (const group of report.slice(0, 10)) {
        console.log(`  ${group.province} ${group.spreadM} m: ${group.address.slice(0, 70)} [${group.rowIds.join(', ')}]`);
    }

    console.log('\nfirst rows to label:');
    for (const row of toLabel.slice(0, 10)) {
        console.log(`  id ${row.id}  ${row.province}  group of ${row.groupSize}  ${row.spreadM.toFixed(1)} m  ${row.address.slice(0, 60)}`);
    }

    if (toLabel.length === 0) {
        console.log('\nNothing to label.');
        return;
    }
    if (!shouldWrite) {
        console.log('\nDry run. Re-run with --write to apply.');
        return;
    }

    const backupFile = path.join(BACKUP_DIR, `dupe-label-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const backup: Backup = {
        createdAt: new Date().toISOString(),
        action: 'label-duplicate-towers',
        label: status,
        provinces,
        maxSeparationM,
        rule: 'tower with statusId null sharing a Parcel address with another tower in the same province',
        rows: toLabel.map((row) => ({
            id: row.id,
            province: row.province,
            address: row.address,
            previousStatusId: row.previousStatusId,
            updatedAtBefore: new Date(0).toISOString(),
            updatedAtAfter: null,
        })),
    };

    const before = await prisma.tower.findMany({
        where: { id: { in: toLabel.map((r) => r.id) } },
        select: { id: true, updatedAt: true },
    });
    const beforeById = new Map(before.map((r) => [r.id, r.updatedAt.toISOString()]));
    backup.rows = backup.rows.map((row) => ({ ...row, updatedAtBefore: beforeById.get(row.id) ?? '' }));
    writeJson(backupFile, backup);
    console.log(`\nbackup before any write: ${path.relative(process.cwd(), backupFile)}`);

    console.log(`\nwriting the label on ${toLabel.length} rows...`);
    for (const ids of chunk(toLabel.map((r) => r.id), 1000)) {
        const result = await prisma.tower.updateMany({
            where: { id: { in: ids }, statusId: null },
            data: { statusId: status.id },
        });
        console.log(`  ${result.count} of ${ids.length} rows in this chunk took the label`);
    }

    const after = await prisma.tower.findMany({
        where: { id: { in: toLabel.map((r) => r.id) } },
        select: { id: true, statusId: true, updatedAt: true },
    });
    const afterById = new Map(after.map((r) => [r.id, r]));
    backup.rows = backup.rows.map((row) => {
        const now = afterById.get(row.id);
        if (!now || now.statusId !== status.id) throw new Error(`row ${row.id} did not take the label`);
        return { ...row, updatedAtAfter: now.updatedAt.toISOString() };
    });
    writeJson(backupFile, backup);
    console.log(`backup stamped with the new timestamps: ${path.relative(process.cwd(), backupFile)}`);

    const leftover = await selectCandidates(provinces);
    summarise('\nuntouched rows still in a shared-address group', leftover);
}

async function restore(backupPath: string): Promise<void> {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as Backup;
    console.log(`backup: ${backupPath}`);
    console.log(`created ${backup.createdAt}, label ${backup.label.id} "${backup.label.name}", ${backup.rows.length} rows`);

    const current = await prisma.tower.findMany({
        where: { id: { in: backup.rows.map((r) => r.id) } },
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

    console.log(`can revert: ${revert.length}, skipped: ${skipped.length}`);
    for (const note of skipped.slice(0, 15)) console.log(`  ${note}`);
    if (skipped.length > 15) console.log(`  ... and ${skipped.length - 15} more`);

    if (!shouldWrite) {
        console.log('\nDry run. Re-run with --restore --write to apply.');
        return;
    }

    const groups = new Map<string, BackupRow[]>();
    for (const row of revert) {
        const key = `${row.previousStatusId ?? 'null'}|${row.updatedAtAfter ?? ''}`;
        const list = groups.get(key);
        if (list) list.push(row);
        else groups.set(key, [row]);
    }

    for (const [key, rows] of groups) {
        const [previousRaw, updatedAt] = key.split('|');
        const previousStatusId = previousRaw === 'null' ? null : Number(previousRaw);
        for (const ids of chunk(rows.map((r) => r.id), 1000)) {
            const result = await prisma.tower.updateMany({
                where: {
                    id: { in: ids },
                    statusId: backup.label.id,
                    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
                },
                data: { statusId: previousStatusId },
            });
            console.log(`  reverted ${result.count} of ${ids.length} rows to status ${previousRaw}`);
        }
    }

    const left = await prisma.tower.count({ where: { id: { in: backup.rows.map((r) => r.id) }, statusId: backup.label.id } });
    console.log(`rows from this backup still carrying the label: ${left}`);
}

async function main() {
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
