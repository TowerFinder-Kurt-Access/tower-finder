/**
 * Read-only dry run: for every Canadian parcel, recompute the city + postal code from
 * its address string and report how many would change. Writes nothing.
 *
 *   npx tsx scripts/checks/dry-run-city-extraction.ts
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { ABBR_TO_PROVINCE } from '../../src/lib/locations';
import { buildOfficialLookup, extractCity, extractPostalCode, normalizeCityName, provinceCodeFrom } from '../../src/lib/extract-location';

const prisma = new PrismaClient();
const official: Record<string, string[]> = JSON.parse(fs.readFileSync('src/lib/canadian_cities.json', 'utf-8'));
const lookupCache = new Map<string, Map<string, string>>();

function lookupFor(code: string) {
    if (!lookupCache.has(code)) lookupCache.set(code, buildOfficialLookup(official[code] || []));
    return lookupCache.get(code)!;
}

async function main() {
    try {
        const parcels = await prisma.parcel.findMany({
            where: { country: { equals: 'Canada', mode: 'insensitive' }, address: { not: null } },
            select: { id: true, address: true, cityRaw: true, provinceRaw: true, stateRaw: true, postalCode: true },
        });
        console.log(`Canadian parcels with an address: ${parcels.length}\n`);

        let cityResolved = 0, cityChanged = 0, cityUnresolved = 0, noProvince = 0;
        let postalResolved = 0, postalChanged = 0;
        let regressionRisk = 0; // old cityRaw was itself an official city, but we'd change it
        const unresolvedByProv: Record<string, number> = {};
        const sampleRegressions: string[] = [];

        for (const p of parcels) {
            const addr = p.address!;
            const code = provinceCodeFrom(p.provinceRaw || p.stateRaw, addr);
            if (!code) { noProvince++; continue; }
            const provName = ABBR_TO_PROVINCE[code];
            const lookup = lookupFor(code);

            const city = extractCity(addr, lookup, provName);
            if (city) {
                cityResolved++;
                if (normalizeCityName(city) !== normalizeCityName(p.cityRaw || '')) {
                    cityChanged++;
                    // If the OLD cityRaw was itself a valid official city, changing it is riskier.
                    if (p.cityRaw && lookup.has(normalizeCityName(p.cityRaw))) {
                        regressionRisk++;
                        if (sampleRegressions.length < 30) sampleRegressions.push(`  "${p.cityRaw}" -> "${city}"  [${code}]  ${addr.slice(0, 75)}`);
                    }
                }
            } else {
                cityUnresolved++;
                unresolvedByProv[code] = (unresolvedByProv[code] || 0) + 1;
            }

            const postal = extractPostalCode(addr);
            if (postal) {
                postalResolved++;
                if (postal !== (p.postalCode || '')) postalChanged++;
            }
        }

        console.log(`City: resolved to an official name for ${cityResolved} (${((cityResolved / parcels.length) * 100).toFixed(1)}%)`);
        console.log(`      of those, would CHANGE: ${cityChanged}`);
        console.log(`      no official match:      ${cityUnresolved}`);
        console.log(`      province unresolved:    ${noProvince}`);
        console.log(`Postal: found in address for ${postalResolved}; would change ${postalChanged}\n`);
        console.log(`Unresolved by province: ${Object.entries(unresolvedByProv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
        console.log(`Changes where OLD value was ALSO an official city (regression risk): ${regressionRisk}`);
        console.log(sampleRegressions.join('\n'));
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
