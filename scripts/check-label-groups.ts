import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const rows = await prisma.tower.findMany({
        where: { OR: [{ humanLabel: 'tower' }, { humanLabel: 'not_tower' }] },
        select: { lat: true, lon: true, humanLabel: true, parcel: { select: { provinceRaw: true, stateRaw: true } } },
    });
    const g = new Map<string, { n: number; pos: number }>();
    for (const t of rows) {
        const p = (t.parcel?.provinceRaw ?? '').trim() || (t.parcel?.stateRaw ?? '').trim();
        const k = p ? `p:${p.toLowerCase()}` : `lat:${Math.floor(t.lat)}`;
        const e = g.get(k) ?? { n: 0, pos: 0 };
        e.n++;
        if (t.humanLabel === 'tower') e.pos++;
        g.set(k, e);
    }
    console.log('groups:', g.size, 'labeled:', rows.length);
    for (const [k, v] of [...g.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) {
        console.log(k, JSON.stringify(v));
    }
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
