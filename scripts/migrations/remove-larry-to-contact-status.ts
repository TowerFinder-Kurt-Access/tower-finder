/**
 * One-off: remove the stray "Larry to Contact" TowerStatus (a data-entry mistake).
 * Guarded so it only deletes when no towers reference it, to avoid stranding towers.
 *
 *   npx tsx scripts/migrations/remove-larry-to-contact-status.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_NAME = 'Larry to Contact';

async function main() {
    try {
        const matches = await prisma.towerStatus.findMany({
            where: { name: { equals: TARGET_NAME, mode: 'insensitive' } },
            include: { _count: { select: { towers: true } } },
        });

        if (matches.length === 0) {
            console.log(`No "${TARGET_NAME}" status found — nothing to do.`);
            return;
        }

        for (const s of matches) {
            if (s._count.towers > 0) {
                console.log(
                    `Skipping status ${s.id} "${s.name}" — it still has ${s._count.towers} tower(s). ` +
                        `Reassign those towers first, then re-run.`
                );
                continue;
            }
            await prisma.towerStatus.delete({ where: { id: s.id } });
            console.log(`Deleted status ${s.id} "${s.name}".`);
        }
    } catch (error) {
        console.error('Script failed:', error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
