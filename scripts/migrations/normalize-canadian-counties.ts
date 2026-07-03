/**
 * Populate the county (census division) for Canadian parcels from their full geocoded
 * `address` string, validating against the official StatsCan Census-Division list
 * (src/lib/canadian_counties.json). Canadian county data is otherwise empty, so this
 * fills a blank field rather than correcting wrong values. Deterministic, idempotent
 * & resumable — same 3-pass, race-safe, connection-retry shape as the city migration.
 *
 *   npx tsx scripts/migrations/normalize-canadian-counties.ts
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { ABBR_TO_PROVINCE } from '../../src/lib/locations';
import { buildCountyLookup, extractCounty, provinceCodeFrom } from '../../src/lib/extract-location';

const prisma = new PrismaClient();
const official: Record<string, string[]> = JSON.parse(fs.readFileSync('src/lib/canadian_counties.json', 'utf-8'));

async function withRetry<T>(fn: () => Promise<T>, tries = 8): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); }
        catch (e: any) {
            lastErr = e;
            const conn = ['P1017', 'P1001', 'P1002', 'P1008', 'P2024'].includes(e?.code) ||
                /closed the connection|reach database|Timed out|Connection/i.test(String(e?.message));
            if (!conn) throw e;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw lastErr;
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
    let idx = 0, done = 0;
    async function loop() {
        while (idx < items.length) {
            await worker(items[idx++]);
            if (++done % 2000 === 0) console.log(`  ...${done}/${items.length}`);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, loop));
}

interface Plan { id: number; countyName: string; provinceId: number }

async function main() {
    try {
        const provinceIdByCode = new Map<string, number>();
        for (const [code, name] of Object.entries(ABBR_TO_PROVINCE)) {
            const p = await withRetry(() => prisma.province.upsert({ where: { code }, update: { name }, create: { code, name } }));
            provinceIdByCode.set(code, p.id);
        }

        const lookups = new Map<string, Map<string, string>>();
        for (const code of Object.keys(official)) lookups.set(code, buildCountyLookup(official[code]));

        const parcels = await withRetry(() => prisma.parcel.findMany({
            where: { country: { equals: 'Canada', mode: 'insensitive' }, address: { not: null } },
            select: { id: true, address: true, countyRaw: true, countyId: true, provinceRaw: true, stateRaw: true },
        }));
        console.log(`Processing ${parcels.length} Canadian parcels...`);

        const countyKey = (name: string, provinceId: number) => `${provinceId}::${name.toLowerCase()}`;
        const plans: Plan[] = [];
        const neededCounties = new Map<string, { name: string; provinceId: number }>();
        for (const p of parcels) {
            const code = provinceCodeFrom(p.provinceRaw || p.stateRaw, p.address!);
            const lookup = code ? lookups.get(code) : undefined;
            const provinceId = code ? provinceIdByCode.get(code) : undefined;
            const county = lookup ? extractCounty(p.address!, lookup, ABBR_TO_PROVINCE[code!]) : null;
            if (county && provinceId && (p.countyRaw !== county || !p.countyId)) {
                plans.push({ id: p.id, countyName: county, provinceId });
                const k = countyKey(county, provinceId);
                if (!neededCounties.has(k)) neededCounties.set(k, { name: county, provinceId });
            }
        }
        console.log(`Plans: ${plans.length} parcels to update, ${neededCounties.size} distinct counties to upsert.`);

        const countyIdCache = new Map<string, number>();
        let ci = 0;
        for (const [k, { name, provinceId }] of neededCounties) {
            const c = await withRetry(() => prisma.county.upsert({
                where: { name_provinceId: { name, provinceId } }, update: {}, create: { name, provinceId },
            }));
            countyIdCache.set(k, c.id);
            if (++ci % 100 === 0) console.log(`  counties ${ci}/${neededCounties.size}`);
        }

        let updated = 0;
        await runPool(plans, 6, async (plan) => {
            const countyId = countyIdCache.get(countyKey(plan.countyName, plan.provinceId));
            await withRetry(() => prisma.parcel.update({
                where: { id: plan.id }, data: { countyId, countyRaw: plan.countyName },
            }));
            updated++;
        });

        console.log(`\nDone. County set for ${updated} parcels.`);
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
