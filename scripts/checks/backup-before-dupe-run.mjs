/**
 * Full row-level backup before the duplicate-tower run.
 *
 * Captures every row the script can write: `Tower` status fields and the whole
 * `Note` table. Output is timestamped JSON under data/dupes/snapshots/, which is
 * gitignored, so tower addresses never reach the public repo.
 *
 *   node scripts/checks/backup-before-dupe-run.mjs
 *
 * To restore by hand, see docs/restore.md. The script also writes its own
 * restore-format backup (dupe-label-*.json) at --write time.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOT_DIR = path.join(process.cwd(), 'data', 'dupes', 'snapshots');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL } } });

try {
    const towers = await prisma.$queryRawUnsafe(
        `SELECT id, "statusId", "humanLabel", "labelSource", "labeledAt", "updatedAt"
         FROM "Tower" ORDER BY id`
    );
    const notes = await prisma.$queryRawUnsafe(
        `SELECT id, "towerId", content, "authorId", "createdAt", "updatedAt"
         FROM "Note" ORDER BY id`
    );

    const iso = (value) => (value ? new Date(value).toISOString() : null);

    const backup = {
        createdAt: new Date().toISOString(),
        purpose: 'Full backup of Tower status fields and the Note table before the duplicate-tower run.',
        database: (process.env.POSTGRES_URL ?? '').split('@')[1]?.split('/')[0] ?? 'unknown',
        counts: { towers: towers.length, notes: notes.length },
        towers: towers.map((r) => ({
            id: Number(r.id),
            statusId: r.statusId === null ? null : Number(r.statusId),
            humanLabel: r.humanLabel,
            labelSource: r.labelSource,
            labeledAt: iso(r.labeledAt),
            updatedAt: iso(r.updatedAt),
        })),
        notes: notes.map((n) => ({
            id: Number(n.id),
            towerId: Number(n.towerId),
            content: n.content,
            authorId: n.authorId === null ? null : Number(n.authorId),
            createdAt: iso(n.createdAt),
            updatedAt: iso(n.updatedAt),
        })),
    };

    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(SNAPSHOT_DIR, `pre-dupe-run-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(backup));

    const sizeMb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
    console.log('backup:', path.relative(process.cwd(), file));
    console.log('towers:', backup.counts.towers, '| notes:', backup.counts.notes, '| size:', sizeMb, 'MB');

    // Verify the file parses and the counts survived the round trip.
    const reread = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ok =
        reread.towers.length === towers.length &&
        reread.notes.length === notes.length &&
        reread.towers.every((t) => Number.isInteger(t.id));
    console.log('verified by re-reading:', ok ? 'yes' : 'NO');
    if (!ok) process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
