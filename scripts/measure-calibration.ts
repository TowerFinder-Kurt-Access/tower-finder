/**
 * Isotonic regression (pooled-adjacent-violators) over measured score bins.
 *
 * The observed tower rate is not monotone in the raw score across narrow bins:
 * the 0.20-0.30 slices measure 26% and 24% while the 0.05-0.15 slices measure
 * 49% and 59%, partly from small samples and partly because reviewed rows arrive
 * from a mixed population. A higher score must never display as a lower rate,
 * or the sorted column lies. POVA pools adjacent violators into the closest
 * monotone fit, preserving the well-measured endpoints.
 *
 * Run with: npx tsx --env-file=.env scripts/measure-calibration.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Bin {
    lo: number;
    hi: number;
    n: number;
    tp: number;
}

async function main(): Promise<void> {
    const rows = await prisma.tower.findMany({
        where: {
            humanLabel: { in: ['tower', 'not_tower'] },
            aiTowerScore: { not: null },
            aiModelVersion: 'rf-v2-2026-10-08',
        },
        select: { aiTowerScore: true, humanLabel: true },
    });
    const edges = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 1.01];
    const bins: Bin[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
        const inBand = rows.filter(r => {
            const s = r.aiTowerScore ?? 0;
            return s >= edges[i] && s < edges[i + 1];
        });
        if (!inBand.length) continue;
        bins.push({
            lo: edges[i],
            hi: edges[i + 1],
            n: inBand.length,
            tp: inBand.filter(r => r.humanLabel === 'tower').length,
        });
    }
    console.log('measured bins:');
    for (const b of bins) {
        console.log(`  ${b.lo.toFixed(2)}-${b.hi.toFixed(2)}  checked ${String(b.n).padStart(4)}  rate ${(b.tp / b.n * 100).toFixed(0)}%`);
    }

    // POVA: repeatedly merge the last pair whenever it violates non-decreasing.
    const blocks: { lo: number; hi: number; n: number; tp: number }[] = [];
    const push = (b: Bin) => {
        blocks.push({ lo: b.lo, hi: b.hi, n: b.n, tp: b.tp });
        while (blocks.length > 1) {
            const a = blocks[blocks.length - 2];
            const c = blocks[blocks.length - 1];
            if (a.tp / a.n <= c.tp / c.n + 1e-12) break;
            blocks.splice(blocks.length - 2, 2, {
                lo: a.lo,
                hi: c.hi,
                n: a.n + c.n,
                tp: a.tp + c.tp,
            });
        }
    };
    bins.forEach(push);

    console.log('\nmonotone anchors (raw -> measured rate):');
    const anchors = blocks.map(b => ({ raw: b.lo, precision: Number((b.tp / b.n).toFixed(4)), checked: b.n }));
    anchors.push({ raw: 1.0, precision: anchors[anchors.length - 1].precision, checked: 0 });
    for (const a of anchors) console.log(`  ${a.raw.toFixed(2)} -> ${(a.precision * 100).toFixed(0)}%  (n=${a.checked})`);
    console.log('\nSCORE_ANCHORS = ' + JSON.stringify(anchors));
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
