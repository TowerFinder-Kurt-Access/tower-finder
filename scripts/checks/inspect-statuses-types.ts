/**
 * Read-only: list TowerStatus and TowerType rows with their tower counts, and flag
 * case/whitespace duplicate groups. Helps decide what to merge/remove.
 *
 *   npx tsx scripts/checks/inspect-statuses-types.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const key = (v: string) => v.trim().toLowerCase();

async function report(label: string, rows: { id: number; name: string; count: number }[]) {
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    for (const r of rows) {
        console.log(`  ID ${r.id}: "${r.name}"  (towers: ${r.count})`);
    }
    const groups = new Map<string, number>();
    rows.forEach((r) => groups.set(key(r.name), (groups.get(key(r.name)) ?? 0) + 1));
    const dupes = [...groups.entries()].filter(([, n]) => n > 1);
    console.log(`  duplicate groups: ${dupes.length}` + (dupes.length ? ` -> ${dupes.map(([k]) => k).join(', ')}` : ''));
}

async function main() {
    try {
        const statuses = await prisma.towerStatus.findMany({
            include: { _count: { select: { towers: true } } },
            orderBy: { name: 'asc' },
        });
        const types = await prisma.towerType.findMany({
            include: { _count: { select: { towers: true } } },
            orderBy: { name: 'asc' },
        });
        await report('TowerStatus', statuses.map((s) => ({ id: s.id, name: s.name, count: s._count.towers })));
        await report('TowerType', types.map((t) => ({ id: t.id, name: t.name, count: t._count.towers })));
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
