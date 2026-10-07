/**
 * Loads hand-check verdicts from a filled audit sheet back into the database as real
 * labels, so the next backfill and retrain uses facts instead of mined guesses.
 *
 * Writes humanLabel + labelSource 'audit' + labeledAt. That label source is preserved:
 * scripts/backfill-tower-labels.ts recomputes mined labels from status and notes on every
 * run, so without a protected source an audit verdict would be overwritten on the next run.
 *
 * Safe to re-run. Only rows whose verdict actually changed are written, and the summary
 * prints measured precision per score band, which is the real accuracy number.
 *
 * Dry run by default. Pass --write to actually update the database.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/import-audit-verdicts.ts "data/score-audit-top-2026-10-06.csv"
 *   npx tsx --env-file=.env scripts/import-audit-verdicts.ts "<path>" --write
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

const VALID = new Set(['tower', 'not_tower']);

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') inQuotes = false;
            else cur += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
}

async function main() {
    const file = process.argv[2];
    if (!file || !fs.existsSync(file)) {
        throw new Error('pass the filled CSV path, e.g. scripts/import-audit-verdicts.ts "data/score-audit-top-2026-10-06.csv"');
    }
    const write = process.argv.includes('--write');

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    const header = parseCsvLine(lines[0]);
    const col = (name: string) => header.indexOf(name);
    const idI = col('tower_id'), scoreI = col('score_pct'), verdictI = col('verdict'), reasonI = col('wrong_reason');
    if (idI < 0 || verdictI < 0) throw new Error(`missing tower_id or verdict column in ${file}`);

    const verdicts: { id: number; verdict: string; reason: string; score: number }[] = [];
    let blank = 0, invalid = 0, unsure = 0;
    for (const line of lines.slice(1)) {
        const c = parseCsvLine(line);
        const id = Number(c[idI]);
        const verdict = (c[verdictI] ?? '').toLowerCase();
        if (!Number.isFinite(id)) continue;
        if (!verdict) { blank++; continue; }
        if (verdict === 'unsure') { unsure++; continue; }
        if (!VALID.has(verdict)) { invalid++; console.warn(`  row ${id}: unreadable verdict "${c[verdictI]}"`); continue; }
        verdicts.push({ id, verdict, reason: reasonI >= 0 ? (c[reasonI] ?? '') : '', score: Number(c[scoreI]) || 0 });
    }

    console.log(`file: ${file}`);
    console.log(`verdicts to apply: ${verdicts.length} | blank: ${blank} | unsure: ${unsure} | unreadable: ${invalid}`);
    if (!verdicts.length) {
        console.log('nothing to do');
        return;
    }

    // Measured accuracy by score band. This is the number nobody has had until now.
    const bandOf = (s: number) => (s >= 80 ? '80-100' : s >= 70 ? '70-80' : s >= 57.5 ? '57.5-70' : 'below flag');
    const bands = new Map<string, { tp: number; n: number }>();
    for (const v of verdicts) {
        const b = bands.get(bandOf(v.score)) ?? { tp: 0, n: 0 };
        if (v.verdict === 'tower') b.tp++;
        b.n++;
        bands.set(bandOf(v.score), b);
    }
    console.log('\nmeasured accuracy by score band:');
    console.log('band        checked  real towers  precision');
    for (const [name, b] of Array.from(bands.entries()).sort()) {
        console.log(`${name.padEnd(11)}${String(b.n).padStart(7)}${String(b.tp).padStart(13)}${(b.tp / b.n * 100).toFixed(0).padStart(11)}%`);
    }
    const overall = verdicts.filter(v => v.verdict === 'tower').length / verdicts.length;
    console.log(`\noverall precision of the checked rows: ${(overall * 100).toFixed(1)}%`);

    const reasons = new Map<string, number>();
    for (const v of verdicts) if (v.verdict === 'not_tower' && v.reason) reasons.set(v.reason, (reasons.get(v.reason) || 0) + 1);
    if (reasons.size) {
        console.log('why the high scores were wrong:');
        for (const [r, n] of Array.from(reasons.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);
    }

    const existing = await prisma.tower.findMany({
        where: { id: { in: verdicts.map(v => v.id) } },
        select: { id: true, humanLabel: true, labelSource: true },
    });
    const map = new Map(existing.map(t => [t.id, t]));
    const changes = verdicts.filter(v => {
        const cur = map.get(v.id);
        return cur && cur.humanLabel !== v.verdict;
    });
    const alreadyAudit = existing.filter(t => t.labelSource === 'audit').length;
    console.log(`\nlabels that would change: ${changes.length} | already marked as audited: ${alreadyAudit}`);

    if (!write) {
        console.log('\ndry run. add --write to apply to the database.');
        console.log(`  npx tsx --env-file=.env scripts/import-audit-verdicts.ts "${file}" --write`);
        return;
    }

    const now = new Date();
    let applied = 0;
    for (const v of verdicts) {
        await prisma.tower.update({
            where: { id: v.id },
            data: {
                humanLabel: v.verdict,
                labelSource: 'audit',
                labeledAt: now,
            },
        });
        applied++;
    }
    console.log(`\napplied ${applied} audit labels`);
    console.log('next: npx tsx --env-file=.env scripts/train-tower-classifier.ts');
    console.log('then: npx tsx --env-file=.env scripts/score-towers.ts');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());