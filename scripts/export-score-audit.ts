/**
 * Builds the hand-check sheet that measures what the tower score is actually worth.
 *
 * The model's held-out metrics are measured against mined labels (review status and
 * note text), which are guesses. Only a human looking at satellite imagery gives the
 * real answer, so this samples towers across score bands and writes one row per tower
 * with a satellite link and an empty verdict column.
 *
 * Fill the verdict column with tower / not_tower, then read the precision of each band.
 * The high bands are the ones the app calls "likely_tower"; if precision there is poor,
 * the label is the problem and the model cannot fix it.
 *
 * Run: npx tsx --env-file=.env scripts/export-score-audit.ts [perBand]
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const PER_BAND = Number(process.argv[2]) || 40;

/** Bands follow the score distribution, with the model's flag cut as its own edge. */
const BANDS: { label: string; min: number; max: number }[] = [
    { label: '0.00-0.20', min: 0, max: 0.2 },
    { label: '0.20-0.40', min: 0.2, max: 0.4 },
    { label: '0.40-flag', min: 0.4, max: 0.575 },
    { label: 'flag-0.75', min: 0.575, max: 0.75 },
    { label: '0.75-1.00', min: 0.75, max: 1.0001 },
];

function csvCell(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
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

    const header = [
        'tower_id', 'score_pct', 'band', 'flagged_by_model', 'lat', 'lon',
        'city', 'province', 'source', 'existing_label', 'satellite_url', 'verdict', 'notes',
    ];
    const rows: string[] = [header.join(',')];

    for (const band of BANDS) {
        const inBand = towers.filter(t => {
            const s = t.aiTowerScore ?? 0;
            return s >= band.min && s < band.max;
        });
        // Every k-th row in id order, so the sample spreads over every province
        // instead of clustering in whichever region imported first.
        const step = Math.max(1, Math.floor(inBand.length / PER_BAND));
        const picked = inBand.filter((_, i) => i % step === 0).slice(0, PER_BAND);
        console.log(`${band.label}: ${inBand.length} available, sampled ${picked.length}`);

        for (const t of picked) {
            const score = t.aiTowerScore ?? 0;
            rows.push([
                t.id,
                Math.round(score * 100),
                band.label,
                score >= 0.575 ? 'yes' : 'no',
                t.lat,
                t.lon,
                (t.parcel?.city as { name?: string } | null)?.name ?? '',
                (t.parcel?.province as { name?: string } | null)?.name ?? '',
                t.source,
                t.humanLabel ?? '',
                `https://www.google.com/maps/@${t.lat},${t.lon},200m/data=!3m1!1e3`,
                '', // verdict: fill with tower / not_tower / unsure
                '',
            ].map(csvCell).join(','));
        }
    }

    const outDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `score-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    fs.writeFileSync(outPath, `${rows.join('\n')}\n`, 'utf8');
    console.log(`\n${rows.length - 1} rows written to ${outPath}`);
    console.log('Fill the verdict column from satellite view, then compare precision per band.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());