/**
 * Phase 0 audit for the tower-lead AI classifier (read-only).
 *
 * Answers: where can training labels come from, are there enough per class,
 * and do Towers (labeled) and TowerLeads (to be scored) share enough features?
 *
 * Run: npx tsx --env-file=.env scratch/audit_lead_labels.ts
 * Writes report to docs/phase0-label-audit.md. Performs zero DB writes.
 */
import { PrismaClient } from '@prisma/client';
import { latLngToCell, gridDisk } from 'h3-js';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ---------- label rule under audit ----------
// Statuses whose human meaning implies "verified real tower / site being worked"
const TOWER_STATUS_IDS = new Set([3, 5, 10, 11, 12, 13, 14, 15, 17]);
// Statuses whose meaning implies "human looked and found no cell site"
const NOT_TOWER_STATUS_IDS = new Set([9]); // "No GSV"
// Everything else (1 New, 2 Could Not Find Owner, 4 Not Interested, 6 No nearby
// property, 16 Duplicate Tower, null) is ambiguous until sampled.

const NEG_NOTE_PATTERNS = [
    'no cell', 'no tower', 'not a tower', 'water tower', 'silo', 'grain',
    'crane', 'windmill', 'flag', 'light pole', 'streetlight', 'street light',
    'removed', 'demolished',
];

const H3_RES = 8; // ~461 m hex edge
const MAX_RING = 4; // search up to ~4 rings (~3.5 km) for nearest neighbor
const SAMPLES_PER_BUCKET = 10;

const report: string[] = [];
function out(line = '') {
    console.log(line);
    report.push(line);
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function pct(n: number, total: number) {
    return total === 0 ? '0%' : `${(100 * n / total).toFixed(1)}%`;
}

function sample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

type TowerRow = {
    id: number; lat: number; lon: number; statusId: number | null;
    source: string; createdAt: Date; updatedAt: Date; rawImportData: unknown;
};
type LeadRow = {
    id: number; lat: number; lon: number; source: string; province: string | null;
    type: string | null; tags: unknown; promotedToTowerId: number | null;
};
type NoteRow = { towerId: number; content: string };

async function main() {
    out('# Phase 0 — Label audit for tower-lead classifier');
    out();
    out(`Generated ${new Date().toISOString()} by \`scratch/audit_lead_labels.ts\` (read-only).`);
    out();

    const [towers, leads, notes, statuses] = await Promise.all([
        prisma.tower.findMany({
            select: {
                id: true, lat: true, lon: true, statusId: true, source: true,
                createdAt: true, updatedAt: true, rawImportData: true,
            },
        }) as Promise<TowerRow[]>,
        prisma.towerLead.findMany({
            select: {
                id: true, lat: true, lon: true, source: true, province: true,
                type: true, tags: true, promotedToTowerId: true,
            },
        }) as Promise<LeadRow[]>,
        prisma.note.findMany({ select: { towerId: true, content: true } }) as Promise<NoteRow[]>,
        prisma.towerStatus.findMany(),
    ]);

    const statusName = new Map<number, string>(statuses.map(s => [s.id, s.name]));
    const notesByTower = new Map<number, string[]>();
    for (const n of notes) {
        const list = notesByTower.get(n.towerId) ?? [];
        list.push(n.content);
        notesByTower.set(n.towerId, list);
    }

    out(`Totals: **${towers.length} towers**, **${leads.length} leads**, **${notes.length} notes**, ${statuses.length} statuses.`);
    out();

    // ============ 1. Label inventory on Tower ============
    out('## 1. Label inventory on `Tower`');
    out();
    out('| status | towers | with notes | updated after create | proposed label |');
    out('|---|---|---|---|---|');

    const byStatus = new Map<number | null, TowerRow[]>();
    for (const t of towers) {
        const list = byStatus.get(t.statusId) ?? [];
        list.push(t);
        byStatus.set(t.statusId, list);
    }
    const proposedLabel = (sid: number | null) =>
        sid !== null && TOWER_STATUS_IDS.has(sid) ? 'tower'
            : sid !== null && NOT_TOWER_STATUS_IDS.has(sid) ? 'not_tower'
                : 'ambiguous';

    const rows = [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [sid, list] of rows) {
        const name = sid === null ? '(null)' : `${statusName.get(sid)} (${sid})`;
        const withNotes = list.filter(t => notesByTower.has(t.id)).length;
        const touched = list.filter(t => t.updatedAt.getTime() - t.createdAt.getTime() > 60_000).length;
        out(`| ${name} | ${list.length} | ${withNotes} | ${touched} | ${proposedLabel(sid)} |`);
    }
    out();

    // ---- negative mining from note text ----
    out('### Negative-pattern notes');
    out();
    out('| pattern | notes | distinct towers | of those, status "No GSV" |');
    out('|---|---|---|---|');
    const towerById = new Map(towers.map(t => [t.id, t]));
    const negNoteTowers = new Set<number>();
    const samplesByPattern = new Map<string, string[]>();
    for (const pat of NEG_NOTE_PATTERNS) {
        const matched = notes.filter(n => n.content.toLowerCase().includes(pat));
        const towerIds = new Set(matched.map(n => n.towerId));
        const inNoGsv = [...towerIds].filter(id => towerById.get(id)?.statusId === 9).length;
        matched.forEach(n => negNoteTowers.add(n.towerId));
        samplesByPattern.set(pat, sample(matched.map(n => `[tower ${n.towerId}] ${n.content.replace(/\s+/g, ' ').slice(0, 140)}`), SAMPLES_PER_BUCKET));
        if (matched.length > 0) out(`| ${pat} | ${matched.length} | ${towerIds.size} | ${inNoGsv} |`);
    }
    out();

    const noGsvTowers = byStatus.get(9) ?? [];
    const noGsvWithNegNote = noGsvTowers.filter(t => negNoteTowers.has(t.id)).length;
    const noGsvWithAnyNote = noGsvTowers.filter(t => notesByTower.has(t.id)).length;
    const negNoteOutsideNoGsv = [...negNoteTowers].filter(id => towerById.get(id)?.statusId !== 9).length;
    out(`- "No GSV" towers: ${noGsvTowers.length}; with any note: ${noGsvWithAnyNote}; with a negative-pattern note: ${noGsvWithNegNote}.`);
    out(`- Towers with a negative-pattern note but NOT status "No GSV": ${negNoteOutsideNoGsv}.`);
    out();

    // ---- samples for eyeballing ----
    out('### Note samples per bucket (eyeball these)');
    out();
    for (const [pat, samples] of samplesByPattern) {
        if (samples.length === 0) continue;
        out(`**\`${pat}\`**`);
        out();
        samples.forEach(s => out(`- ${s}`));
        out();
    }

    // samples of notes on positive-status and ambiguous-status towers
    for (const [title, ids] of [
        ['Positive-status towers (proposed `tower`)', TOWER_STATUS_IDS],
        ['Ambiguous statuses (1, 2, 4, 6, 16)', new Set([1, 2, 4, 6, 16])],
    ] as const) {
        const pool: string[] = [];
        for (const t of towers) {
            if (t.statusId !== null && (ids as Set<number>).has(t.statusId) && notesByTower.has(t.id)) {
                for (const c of notesByTower.get(t.id)!) {
                    pool.push(`[tower ${t.id}, ${statusName.get(t.statusId)}] ${c.replace(/\s+/g, ' ').slice(0, 140)}`);
                }
            }
        }
        out(`### ${title} — ${pool.length} notes, samples:`);
        out();
        sample(pool, SAMPLES_PER_BUCKET * 2).forEach(s => out(`- ${s}`));
        out();
    }

    // ---- per-class totals under proposed rule ----
    const positives = towers.filter(t => t.statusId !== null && TOWER_STATUS_IDS.has(t.statusId));
    const negativesStatus = towers.filter(t => t.statusId !== null && NOT_TOWER_STATUS_IDS.has(t.statusId));
    const negativesUnion = new Set([...negativesStatus.map(t => t.id), ...negNoteTowers]);
    // a tower in both camps (positive status + negative note) is suspicious
    const conflicted = positives.filter(t => negNoteTowers.has(t.id)).length;
    out('### Proposed-rule class totals');
    out();
    out(`- \`tower\` (positive statuses): **${positives.length}**`);
    out(`- \`not_tower\` (status "No GSV" ∪ negative-pattern note): **${negativesUnion.size}**`);
    out(`- conflicted (positive status but negative note): ${conflicted}`);
    out(`- promoted leads (lead-native positives): ${leads.filter(l => l.promotedToTowerId !== null).length}`);
    out();

    // ============ 2. Feature availability ============
    out('## 2. Feature availability (common feature space)');
    out();

    function keyFreq(objs: unknown[], topN = 25): [string, number][] {
        const freq = new Map<string, number>();
        for (const o of objs) {
            if (o && typeof o === 'object' && !Array.isArray(o)) {
                for (const k of Object.keys(o as Record<string, unknown>)) {
                    freq.set(k, (freq.get(k) ?? 0) + 1);
                }
            }
        }
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
    }

    const labeledTowers = [...positives, ...towers.filter(t => negativesUnion.has(t.id))];
    out(`### \`Tower.rawImportData\` keys across the ${labeledTowers.length} labeled towers`);
    out();
    out('| key | present | % |');
    out('|---|---|---|');
    for (const [k, n] of keyFreq(labeledTowers.map(t => t.rawImportData))) {
        out(`| ${k} | ${n} | ${pct(n, labeledTowers.length)} |`);
    }
    out();

    const leadsBySource = new Map<string, LeadRow[]>();
    for (const l of leads) {
        const list = leadsBySource.get(l.source) ?? [];
        list.push(l);
        leadsBySource.set(l.source, list);
    }
    for (const [src, list] of leadsBySource) {
        out(`### \`TowerLead.tags\` keys — source ${src} (${list.length} leads)`);
        out();
        out('| key | present | % |');
        out('|---|---|---|');
        for (const [k, n] of keyFreq(list.map(l => l.tags), 20)) {
            out(`| ${k} | ${n} | ${pct(n, list.length)} |`);
        }
        out();
    }

    // ============ 3. Spatial join (h3) ============
    out('## 3. Lead ↔ tower spatial join');
    out();

    const towerCells = new Map<string, TowerRow[]>();
    for (const t of towers) {
        const cell = latLngToCell(t.lat, t.lon, H3_RES);
        const list = towerCells.get(cell) ?? [];
        list.push(t);
        towerCells.set(cell, list);
    }

    function nearestTowerM(lat: number, lon: number, excludeId?: number): number | null {
        const origin = latLngToCell(lat, lon, H3_RES);
        let best: number | null = null;
        for (let k = 0; k <= MAX_RING; k++) {
            for (const cell of gridDisk(origin, k)) {
                for (const t of towerCells.get(cell) ?? []) {
                    if (excludeId !== undefined && t.id === excludeId) continue;
                    const d = haversineM(lat, lon, t.lat, t.lon);
                    if (best === null || d < best) best = d;
                }
            }
            // a hit in ring k is guaranteed closer than anything beyond ring k+1
            if (best !== null && k >= 1) break;
        }
        return best;
    }

    const BANDS = [100, 250, 500, 1000, 2000];
    function bandCounts(dists: (number | null)[]): string {
        const total = dists.length;
        return BANDS.map(b => {
            const n = dists.filter(d => d !== null && d <= b).length;
            return `${pct(n, total)} ≤${b}m`;
        }).join(' · ');
    }

    out('| lead group | n | distance to nearest confirmed tower |');
    out('|---|---|---|');
    const groups = new Map<string, LeadRow[]>();
    for (const l of leads) {
        const k = `${l.source} / ${l.province ?? '?'}`;
        const list = groups.get(k) ?? [];
        list.push(l);
        groups.set(k, list);
    }
    for (const [g, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
        if (list.length < 50) continue; // skip tiny groups in the table
        const dists = list.map(l => nearestTowerM(l.lat, l.lon));
        out(`| ${g} | ${list.length} | ${bandCounts(dists)} |`);
    }
    out();

    // same metric for labeled towers (do proximity features transfer?)
    const posDists = sample(positives, 2000).map(t => nearestTowerM(t.lat, t.lon, t.id));
    const negSample = sample(towers.filter(t => negativesUnion.has(t.id)), 2000);
    const negDists = negSample.map(t => nearestTowerM(t.lat, t.lon, t.id));
    out('Distance to nearest *other* confirmed tower, for labeled towers:');
    out();
    out(`- \`tower\` class (n=${posDists.length}): ${bandCounts(posDists)}`);
    out(`- \`not_tower\` class (n=${negDists.length}): ${bandCounts(negDists)}`);
    out();

    // ============ 4. Geography overlap ============
    out('## 4. Geography overlap (domain shift)');
    out();
    out('Towers carry no province column; the Excel source file name is the region proxy.');
    out();
    out('| tower source file | total | labeled tower | labeled not_tower |');
    out('|---|---|---|---|');
    const bySrc = new Map<string, TowerRow[]>();
    for (const t of towers) {
        const list = bySrc.get(t.source) ?? [];
        list.push(t);
        bySrc.set(t.source, list);
    }
    for (const [src, list] of [...bySrc.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const pos = list.filter(t => t.statusId !== null && TOWER_STATUS_IDS.has(t.statusId)).length;
        const neg = list.filter(t => negativesUnion.has(t.id)).length;
        out(`| ${src} | ${list.length} | ${pos} | ${neg} |`);
    }
    out();
    out('| lead province | leads |');
    out('|---|---|');
    const leadProv = new Map<string, number>();
    for (const l of leads) leadProv.set(l.province ?? '?', (leadProv.get(l.province ?? '?') ?? 0) + 1);
    for (const [prov, n] of [...leadProv.entries()].sort((a, b) => b[1] - a[1])) {
        out(`| ${prov} | ${n} |`);
    }
    out();

    // ============ write report ============
    const reportPath = path.join(process.cwd(), 'docs', 'phase0-label-audit.md');
    fs.writeFileSync(reportPath, report.join('\n') + '\n', 'utf8');
    console.log(`\nReport written to ${reportPath}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
