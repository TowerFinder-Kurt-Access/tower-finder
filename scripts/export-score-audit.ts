/**
 * Builds the hand-check sheet that produces REAL labels for the tower classifier.
 *
 * Every metric the model reports is measured against labels mined from review status,
 * which are guesses. This sheet is the only way to replace those guesses with facts.
 *
 * Default focus is the TOP tier, not an even spread: the rows scoring 80%+ are the ones
 * coworkers act on, they are the most reliable rows we produce, and they are also where
 * a wrong call costs a wasted property-owner investigation. Measured precision there is
 * about 90%, which means roughly 1 in 10 is still not a tower.
 *
 * Rows come out sorted highest score first, so a reviewer who runs out of time has still
 * covered the most valuable rows.
 *
 * Fill in:
 *   verdict      tower | not_tower | unsure
 *   wrong_reason only when verdict is not_tower: what was actually there
 *
 * Then load the results with scripts/import-audit-verdicts.ts, which writes them as
 * humanLabel with labelSource 'audit', so the next backfill and retrain uses them.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/export-score-audit.ts                # top tier
 *   npx tsx --env-file=.env scripts/export-score-audit.ts --focus all    # even spread
 *   npx tsx --env-file=.env scripts/export-score-audit.ts --limit 150
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Held-out precision per band, from the 914-row evaluation of rf-v2-2026-10-06. Small
 * samples, so treat as a hint rather than a promise. Shown to the reviewer so a high
 * score is not mistaken for a guarantee.
 */
const BAND_PRECISION: { min: number; precision: number | null; n: number }[] = [
    { min: 0.80, precision: 0.90, n: 10 },
    { min: 0.70, precision: 0.87, n: 60 },
    { min: 0.65, precision: 0.79, n: 19 },
    { min: 0.575, precision: 0.75, n: 20 },
    { min: 0.0, precision: null, n: 0 },
];
const expectedPrecision = (s: number): string => {
    const hit = BAND_PRECISION.find(b => s >= b.min);
    return hit?.precision ? `${Math.round(hit.precision * 100)}% (measured on only ${hit.n} rows)` : 'below the flagged range';
};

/** Even spread across every band, for measuring the whole score rather than the top. */
const BANDS: { label: string; min: number; max: number }[] = [
    { label: '0.00-0.20', min: 0, max: 0.2 },
    { label: '0.20-0.40', min: 0.2, max: 0.4 },
    { label: '0.40-0.575', min: 0.4, max: 0.575 },
    { label: '0.575-0.75', min: 0.575, max: 0.75 },
    { label: '0.75-1.00', min: 0.75, max: 1.0001 },
];

function csvCell(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
    const focus = arg('--focus', 'top');
    const limit = Number(arg('--limit', focus === 'top' ? '400' : '40'));

    const towers = await prisma.tower.findMany({
        where: { aiTowerScore: { not: null } },
        orderBy: { id: 'asc' },
        select: {
            id: true, lat: true, lon: true, aiTowerScore: true, humanLabel: true,
            source: true,
            parcel: { select: { city: true, province: true } },
        },
    });
    console.log(`scored towers: ${towers.length}`);

    let picked: typeof towers;
    if (focus === 'top') {
        // Everything the model is most confident about, plus a sample of the next tier.
        const top = towers.filter(t => (t.aiTowerScore ?? 0) >= 0.80);
        const next = towers.filter(t => (t.aiTowerScore ?? 0) >= 0.70 && (t.aiTowerScore ?? 0) < 0.80);
        const step = Math.max(1, Math.floor(next.length / 150));
        const sampledNext = next.filter((_, i) => i % step === 0);
        picked = [...top, ...sampledNext].sort((a, b) => (b.aiTowerScore ?? 0) - (a.aiTowerScore ?? 0));
        console.log(`top tier: ${top.length} rows at 80%+, plus ${sampledNext.length} sampled from the 70-80% band`);
    } else {
        picked = [];
        for (const band of BANDS) {
            const inBand = towers.filter(t => { const s = t.aiTowerScore ?? 0; return s >= band.min && s < band.max; });
            const step = Math.max(1, Math.floor(inBand.length / limit));
            picked.push(...inBand.filter((_, i) => i % step === 0).slice(0, limit));
        }
    }
    if (picked.length > limit) picked = picked.slice(0, limit);

    const header = [
        'tower_id', 'score_pct', 'what_the_score_really_means', 'lat', 'lon',
        'city', 'province', 'source', 'existing_label', 'satellite_url',
        'verdict', 'wrong_reason', 'notes',
    ];
    const rows: string[] = [header.join(',')];

    for (const t of picked) {
        const score = t.aiTowerScore ?? 0;
        rows.push([
            t.id,
            Math.round(score * 100),
            expectedPrecision(score),
            t.lat,
            t.lon,
            (t.parcel?.city as { name?: string } | null)?.name ?? '',
            (t.parcel?.province as { name?: string } | null)?.name ?? '',
            t.source,
            t.humanLabel ?? '',
            `https://www.google.com/maps/@${t.lat},${t.lon},200m/data=!3m1!1e3`,
            '',   // verdict: tower | not_tower | unsure
            '',   // wrong_reason: what was there when the answer was not_tower
            '',
        ].map(csvCell).join(','));
    }

    const outDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const suffix = focus === 'top' ? 'top' : 'spread';
    const outPath = path.join(outDir, `score-audit-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`);
    fs.writeFileSync(outPath, `${rows.join('\n')}\n`, 'utf8');

    const green = picked.filter(t => (t.aiTowerScore ?? 0) >= 0.70).length;
    console.log(`\n${picked.length} rows written to ${outPath}`);
    console.log(`  ${green} are in the 70%+ "green" tier your coworkers act on`);
    console.log('sorted highest score first: run out of time and the top rows are already covered');
    console.log('fill verdict with tower / not_tower / unsure, then load with:');
    console.log(`  npx tsx --env-file=.env scripts/import-audit-verdicts.ts "${outPath}"`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());