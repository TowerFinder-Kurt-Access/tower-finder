import { PrismaClient } from '@prisma/client';

// Measures the real precision in each score band on rows that already carry a
// human label. This is what lets a raw 0.36 be displayed as an honest
// percentage: the observed share of real towers at that score.
// NOTE: these labels are the training set, so this is an in-sample measure and
// an upper bound, not a promise.
const prisma = new PrismaClient();

const BANDS = [
    { label: '0.00-0.20', min: 0, max: 0.2 },
    { label: '0.20-0.25', min: 0.2, max: 0.25 },
    { label: '0.25-0.338', min: 0.25, max: 0.338 },
    { label: '0.338-0.50', min: 0.338, max: 0.5 },
    { label: '0.50-0.75', min: 0.5, max: 0.75 },
    { label: '0.75+', min: 0.75, max: 1.01 },
];

async function main(): Promise<void> {
    const rows = await prisma.tower.findMany({
        where: {
            humanLabel: { in: ['tower', 'not_tower'] },
            aiTowerScore: { not: null },
            aiModelVersion: 'rf-v2-2026-10-08',
        },
        select: { aiTowerScore: true, humanLabel: true },
    });
    console.log(`labeled rows on the current model: ${rows.length}`);
    if (!rows.length) {
        console.log('no scored labeled rows. run scripts/score-towers.ts first.');
        await prisma.$disconnect();
        return;
    }
    for (const b of BANDS) {
        const inBand = rows.filter(r => {
            const s = r.aiTowerScore ?? 0;
            return s >= b.min && s < b.max;
        });
        if (!inBand.length) {
            console.log(`${b.label.padEnd(13)} checked   0   precision    n/a`);
            continue;
        }
        const tp = inBand.filter(r => r.humanLabel === 'tower').length;
        const pct = ((tp / inBand.length) * 100).toFixed(0).padStart(3);
        console.log(`${b.label.padEnd(13)} checked ${String(inBand.length).padStart(3)}   precision ${pct}%`);
    }
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
