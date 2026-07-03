/**
 * Re-derive the correct city (and postal code) for Canadian parcels from their full
 * geocoded `address` string, validating the city against the official StatsCan CSD
 * list (src/lib/canadian_cities.json). Deterministic, no AI, idempotent & resumable.
 *
 * Three passes:
 *   1. Compute the fix for every parcel in memory (no DB, so no races on the CPU work).
 *   2. Upsert every distinct (city, province) once, sequentially (avoids the P2002
 *      unique-constraint race that concurrent upserts hit).
 *   3. Apply parcel updates concurrently (distinct ids -> no write conflicts), each
 *      wrapped in a connection-drop retry for Supabase's long-job disconnects.
 *
 * Rows already correct are skipped, so re-running after an interruption resumes cheaply.
 *
 * Dry run first:  npx tsx scripts/checks/dry-run-city-extraction.ts
 * Apply:          npx tsx scripts/migrations/normalize-canadian-cities.ts
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { ABBR_TO_PROVINCE } from '../../src/lib/locations';
import { buildOfficialLookup, extractCity, extractPostalCode, provinceCodeFrom } from '../../src/lib/extract-location';

const prisma = new PrismaClient();
const official: Record<string, string[]> = JSON.parse(fs.readFileSync('src/lib/canadian_cities.json', 'utf-8'));

const isFullPostal = (s?: string | null) => !!s && /^[A-Za-z]\d[A-Za-z] \d[A-Za-z]\d$/.test(s);

function choosePostal(current: string | null, extracted: string | null): string | null {
    if (!extracted) return current;
    if (!current) return extracted;
    if (isFullPostal(extracted) && !isFullPostal(current)) return extracted; // upgrade FSA -> full
    return current; // never downgrade a good value
}

// Retry through the transient "server closed the connection" drops Supabase throws on
// long jobs. Prisma re-establishes the connection on the next query.
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

interface Plan { id: number; cityName?: string; provinceId?: number; setProvince?: boolean; postal?: string }

async function main() {
    try {
        const provinceIdByCode = new Map<string, number>();
        for (const [code, name] of Object.entries(ABBR_TO_PROVINCE)) {
            const p = await withRetry(() => prisma.province.upsert({ where: { code }, update: { name }, create: { code, name } }));
            provinceIdByCode.set(code, p.id);
        }

        const lookups = new Map<string, Map<string, string>>();
        for (const code of Object.keys(official)) lookups.set(code, buildOfficialLookup(official[code]));

        const parcels = await withRetry(() => prisma.parcel.findMany({
            where: { country: { equals: 'Canada', mode: 'insensitive' }, address: { not: null } },
            select: { id: true, address: true, cityRaw: true, cityId: true, provinceRaw: true, stateRaw: true, postalCode: true, provinceId: true },
        }));
        console.log(`Processing ${parcels.length} Canadian parcels...`);

        // Pass 1: compute plans in memory.
        const cityKey = (name: string, provinceId: number) => `${provinceId}::${name.toLowerCase()}`;
        const plans: Plan[] = [];
        const neededCities = new Map<string, { name: string; provinceId: number }>();
        for (const p of parcels) {
            const code = provinceCodeFrom(p.provinceRaw || p.stateRaw, p.address!);
            const lookup = code ? lookups.get(code) : undefined;
            const provinceId = code ? provinceIdByCode.get(code) : undefined;
            const city = lookup ? extractCity(p.address!, lookup, ABBR_TO_PROVINCE[code!]) : null;
            const newPostal = choosePostal(p.postalCode, extractPostalCode(p.address!));

            const plan: Plan = { id: p.id };
            if (city && provinceId && (p.cityRaw !== city || !p.cityId || !p.provinceId)) {
                plan.cityName = city;
                plan.provinceId = provinceId;
                plan.setProvince = !p.provinceId;
                const k = cityKey(city, provinceId);
                if (!neededCities.has(k)) neededCities.set(k, { name: city, provinceId });
            }
            if (newPostal && newPostal !== p.postalCode) plan.postal = newPostal;
            if (plan.cityName || plan.postal) plans.push(plan);
        }
        console.log(`Plans: ${plans.length} parcels to update, ${neededCities.size} distinct cities to upsert.`);

        // Pass 2: sequential city upserts (no concurrent-create race).
        const cityIdCache = new Map<string, number>();
        let ci = 0;
        for (const [k, { name, provinceId }] of neededCities) {
            const c = await withRetry(() => prisma.city.upsert({
                where: { name_provinceId: { name, provinceId } }, update: {}, create: { name, provinceId },
            }));
            cityIdCache.set(k, c.id);
            if (++ci % 200 === 0) console.log(`  cities ${ci}/${neededCities.size}`);
        }

        // Pass 3: concurrent parcel updates (distinct ids -> no conflicts).
        let cityUpdated = 0, postalUpdated = 0;
        await runPool(plans, 6, async (plan) => {
            const data: Record<string, unknown> = {};
            if (plan.cityName && plan.provinceId) {
                data.cityId = cityIdCache.get(cityKey(plan.cityName, plan.provinceId));
                data.cityRaw = plan.cityName;
                if (plan.setProvince) data.provinceId = plan.provinceId;
            }
            if (plan.postal) data.postalCode = plan.postal;
            if (Object.keys(data).length === 0) return;
            await withRetry(() => prisma.parcel.update({ where: { id: plan.id }, data }));
            if (data.cityId) cityUpdated++;
            if (data.postalCode) postalUpdated++;
        });

        console.log(`\nDone. City set/corrected: ${cityUpdated}, postal set/upgraded: ${postalUpdated}.`);
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
