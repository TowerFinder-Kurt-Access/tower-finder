/**
 * Backfill Tower.humanLabel from the review signals confirmed by the Phase 0
 * audit (docs/phase0-label-audit.md):
 *   not_tower — status "No GSV" (9) OR a note containing "no cell" / "no tower"
 *               / "not a tower"
 *   tower     — status in {3,5,10,11,12,13,14,15,17}
 * Towers with a positive status AND a negative note are conflicted: skipped.
 *
 * Idempotent: recomputes labels from scratch each run (only touches rows whose
 * label would change), so it can be re-run as reviewers add notes/statuses.
 *
 * Run: npx tsx --env-file=.env scripts/backfill-tower-labels.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOWER_STATUS_IDS = new Set([3, 5, 10, 11, 12, 13, 14, 15, 17]);
const NOT_TOWER_STATUS_ID = 9; // "No GSV"
const NEG_NOTE_PATTERNS = ['no cell', 'no tower', 'not a tower'];

async function main() {
    const [towers, notes] = await Promise.all([
        prisma.tower.findMany({ select: { id: true, statusId: true, humanLabel: true, labelSource: true } }),
        prisma.note.findMany({ select: { towerId: true, content: true } }),
    ]);

    const negNoteTowers = new Set<number>();
    for (const n of notes) {
        const c = n.content.toLowerCase();
        if (NEG_NOTE_PATTERNS.some(p => c.includes(p))) negNoteTowers.add(n.towerId);
    }

    type Target = { label: string | null; source: string | null };
    const counts = { tower: 0, not_tower: 0, conflicted: 0, unlabeled: 0, updated: 0 };

    const targets = new Map<number, Target>();
    for (const t of towers) {
        const hasNegNote = negNoteTowers.has(t.id);
        const hasNegStatus = t.statusId === NOT_TOWER_STATUS_ID;
        const hasPosStatus = t.statusId !== null && TOWER_STATUS_IDS.has(t.statusId);

        let target: Target = { label: null, source: null };
        if (hasPosStatus && hasNegNote) {
            counts.conflicted++;
        } else if (hasNegStatus || hasNegNote) {
            target = {
                label: 'not_tower',
                source: hasNegStatus && hasNegNote ? 'status+note' : hasNegStatus ? 'status' : 'note',
            };
            counts.not_tower++;
        } else if (hasPosStatus) {
            target = { label: 'tower', source: 'status' };
            counts.tower++;
        } else {
            counts.unlabeled++;
        }

        if (t.humanLabel !== target.label || t.labelSource !== target.source) {
            targets.set(t.id, target);
        }
    }

    const changes = [...targets.entries()];
    const now = new Date();
    const CHUNK = 500;
    for (let i = 0; i < changes.length; i += CHUNK) {
        await prisma.$transaction(
            changes.slice(i, i + CHUNK).map(([id, target]) =>
                prisma.tower.update({
                    where: { id },
                    data: {
                        humanLabel: target.label,
                        labelSource: target.source,
                        labeledAt: target.label ? now : null,
                    },
                })
            )
        );
        counts.updated += Math.min(CHUNK, changes.length - i);
        console.log(`updated ${counts.updated}/${changes.length}`);
    }

    console.log('\n--- backfill summary ---');
    console.log(`tower:      ${counts.tower}`);
    console.log(`not_tower:  ${counts.not_tower}`);
    console.log(`conflicted: ${counts.conflicted} (skipped)`);
    console.log(`unlabeled:  ${counts.unlabeled}`);
    console.log(`rows written this run: ${counts.updated}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
