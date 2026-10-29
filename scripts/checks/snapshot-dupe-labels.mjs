import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

/**
 * Snapshot every tower that currently carries the Duplicate Tower label or a
 * "Duplicate of tower #N" note, before the label script is re-run.
 *
 * Field names come straight from the SQL aliases and are camelCase on purpose:
 * a lower-cased key silently produced undefined values in an earlier version.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.POSTGRES_URL } } });

try {
    const rows = await prisma.$queryRawUnsafe(
        `SELECT tw.id,
                tw."statusId"   AS "statusId",
                ts.name         AS "statusName",
                tw."humanLabel" AS "humanLabel",
                tw."labelSource" AS "labelSource",
                tw."labeledAt"  AS "labeledAt"
         FROM "Tower" tw
         LEFT JOIN "TowerStatus" ts ON ts.id = tw."statusId"
         WHERE ts.name = 'Duplicate Tower'
            OR EXISTS (
                SELECT 1 FROM "Note" n
                WHERE n."towerId" = tw.id AND n.content LIKE 'Duplicate of tower #%'
            )
         ORDER BY tw.id`
    );

    const notes = await prisma.$queryRawUnsafe(
        `SELECT id, "towerId", content
         FROM "Note"
         WHERE content LIKE 'Duplicate of tower #%'
         ORDER BY id`
    );

    const snapshot = {
        createdAt: new Date().toISOString(),
        purpose: 'Pre-run snapshot of Duplicate Tower labels, taken before the normalization fix.',
        note: 'Reference and manual recovery. prisma restore reads dupe-label-*.json, not this file.',
        towers: rows.map((r) => ({
            id: Number(r.id),
            statusId: r.statusId === null ? null : Number(r.statusId),
            statusName: r.statusName,
            humanLabel: r.humanLabel,
            labelSource: r.labelSource,
            labeledAt: r.labeledAt ? new Date(r.labeledAt).toISOString() : null,
        })),
        notes: notes.map((n) => ({
            id: Number(n.id),
            towerId: Number(n.towerid),
            content: n.content,
        })),
    };

    const file = 'data/dupes/snapshot-dupe-label-before-normfix.json';
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));

    console.log('wrote:', file);
    console.log('towers:', snapshot.towers.length);
    console.log('notes :', snapshot.notes.length);
} finally {
    await prisma.$disconnect();
}
EOF
