import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAuthUser } from '@/lib/auth-helpers';
import { buildTowerAccessFilter } from '@/lib/tower-access';
import { ABBR_TO_PROVINCE, PROVINCE_TO_ABBR } from '@/lib/locations';
import { dedupeDisplayValues } from '@/lib/normalize';
import { filterOfficialCanadianCities, filterOfficialCanadianCounties, filterCanadianPostalCodes, isCanada } from '@/lib/official-cities';

// Expand a province/state value into all equivalent search terms (full name +
// abbreviation), lower-cased, so distinct-city/zip filtering matches whether the
// data stores "ON" or "Ontario".
function provinceSearchTerms(state: string): string[] {
    const terms = new Set<string>([state]);
    const abbr = PROVINCE_TO_ABBR[state];
    if (abbr) terms.add(abbr);
    const full = ABBR_TO_PROVINCE[state];
    if (full) terms.add(full);
    return Array.from(terms, (t) => t.toLowerCase());
}

// --- Faceted-filter SQL helpers ---
// Each dropdown's options are computed with every OTHER active filter applied, so the
// lists cascade (pick a city -> counties narrow to that city, etc.). Conditions
// reference the Parcel alias `p` and Tower alias `t`.
const lc = (a: string[]) => a.map(s => s.toLowerCase());

function cityCond(v: string[]) {
    const x = Prisma.join(lc(v));
    return Prisma.sql`(LOWER(p."cityRaw") IN (${x}) OR EXISTS (SELECT 1 FROM "City" xci WHERE xci.id = p."cityId" AND LOWER(xci.name) IN (${x})))`;
}
function countyCond(v: string[]) {
    const x = Prisma.join(lc(v));
    return Prisma.sql`(LOWER(p."county") IN (${x}) OR EXISTS (SELECT 1 FROM "County" xco WHERE xco.id = p."countyId" AND LOWER(xco.name) IN (${x})))`;
}
function zipCond(v: string[]) {
    const x = Prisma.join(lc(v));
    return Prisma.sql`(LOWER(p."postalCode") IN (${x}) OR LOWER(p.zip) IN (${x}))`;
}
function stateCond(v: string[]) {
    const terms = new Set<string>();
    v.forEach(s => provinceSearchTerms(s).forEach(t => terms.add(t)));
    const x = Prisma.join(Array.from(terms));
    return Prisma.sql`(LOWER(p."stateRaw") IN (${x}) OR LOWER(p."provinceRaw") IN (${x}) OR EXISTS (SELECT 1 FROM "Province" xpv WHERE xpv.id = p."provinceId" AND (LOWER(xpv.name) IN (${x}) OR LOWER(xpv.code) IN (${x}))))`;
}
function typeCond(v: string[]) {
    return Prisma.sql`t."typeId" IN (SELECT id FROM "TowerType" WHERE LOWER(name) IN (${Prisma.join(lc(v))}))`;
}
function carrierCond(v: string[]) {
    return Prisma.sql`t."carrierId" IN (SELECT id FROM "Carrier" WHERE LOWER(name) IN (${Prisma.join(lc(v))}))`;
}
function statusCond(v: string[]) {
    return Prisma.sql`t."statusId" IN (SELECT id FROM "TowerStatus" WHERE LOWER(name) IN (${Prisma.join(lc(v))}))`;
}

interface FacetFilters {
    country: string | null;
    city: string[]; state: string[]; county: string[]; zip: string[];
    type: string[]; carrier: string[]; status: string[];
}

// AND-conditions for every active filter except `exclude` (so a facet never constrains itself).
function facetConds(f: FacetFilters, exclude: keyof FacetFilters | null): Prisma.Sql[] {
    const c: Prisma.Sql[] = [];
    if (f.country) c.push(Prisma.sql`p.country = ${f.country}`);
    if (exclude !== 'city' && f.city.length) c.push(cityCond(f.city));
    if (exclude !== 'state' && f.state.length) c.push(stateCond(f.state));
    if (exclude !== 'county' && f.county.length) c.push(countyCond(f.county));
    if (exclude !== 'zip' && f.zip.length) c.push(zipCond(f.zip));
    if (exclude !== 'type' && f.type.length) c.push(typeCond(f.type));
    if (exclude !== 'carrier' && f.carrier.length) c.push(carrierCond(f.carrier));
    if (exclude !== 'status' && f.status.length) c.push(statusCond(f.status));
    return c;
}

function whereFrom(conds: Prisma.Sql[], extra?: Prisma.Sql): Prisma.Sql {
    const all = extra ? [extra, ...conds] : conds;
    return all.length ? Prisma.sql`WHERE ${Prisma.join(all, ' AND ')}` : Prisma.empty;
}

// Lookup-facet queries only need the Parcel join when a condition references `p`.
function needsParcel(f: FacetFilters): boolean {
    return Boolean(f.country) || Boolean(f.city.length || f.state.length || f.county.length || f.zip.length);
}

// GET /api/towers - List all towers
const LOOKUPS_TTL_MS = 5 * 60 * 1000;
let lookupsCache: { at: number; data: unknown } | null = null;

export async function GET(request: Request) {
    try {
        // Get authenticated user
        const user = await getAuthUser();

        const { searchParams } = new URL(request.url);
        const state = searchParams.get('state');
        const id = searchParams.get('id');
        const limitStr = searchParams.get('limit');
        const pageStr = searchParams.get('page');
        const distinct = searchParams.get('distinct'); // For fetching distinct values
        const country = searchParams.get('country'); // Filter by country

        const city = searchParams.get('city'); // Filter by city
        const county = searchParams.get('county'); // Filter by county
        const zip = searchParams.get('zip'); // Filter by zip
        const typeFilter = searchParams.get('type');
        const carrierFilter = searchParams.get('carrier');
        const statusFilter = searchParams.get('status');
        const address = searchParams.get('address');
        const owner = searchParams.get('owner');
        const hasOwnerName = searchParams.get('hasOwnerName'); // 'true' | 'false'
        const search = searchParams.get('search'); // Global search across text fields

        // Business filters
        const minBusinessCount = searchParams.get('minBusinessCount');
        const maxBusinessCount = searchParams.get('maxBusinessCount');
        const minAvgDistance = searchParams.get('minAvgDistance');
        const maxAvgDistance = searchParams.get('maxAvgDistance');

        // AI score filter (UI sends 0-100, DB stores 0-1)
        const minAiScore = searchParams.get('minAiScore');
        const maxAiScore = searchParams.get('maxAiScore');

        // Default limit to prevent sending too many towers at once (performance optimization)
        // Use 1000 as default limit if not specified, unless fetching by ID
        const DEFAULT_LIMIT = 1000;
        let limit: number | undefined = DEFAULT_LIMIT;
        if (limitStr) limit = parseInt(limitStr, 10);
        else if (id) limit = undefined;
        const page = pageStr ? parseInt(pageStr, 10) : undefined; // Only set page if explicitly provided

        // Bounding box support
        const bbox = searchParams.get('bbox'); // minLon,minLat,maxLon,maxLat

        // Distinct Queries
        if (distinct === 'countries') {
            const result = await prisma.$queryRaw<{ country: string }[]>`
                SELECT DISTINCT country FROM "Parcel"
                WHERE country IS NOT NULL AND country <> ''
                ORDER BY country
            `;
            return NextResponse.json(result.map(r => r.country));
        }

        if (distinct === 'provinces') {
            // Filter by country if provided
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;

            const result = await prisma.$queryRaw<{ state: string }[]>`
                SELECT DISTINCT name as state FROM (
                    SELECT pr."name" FROM "Province" pr
                    JOIN "Parcel" p ON p."provinceId" = pr.id
                    WHERE 1=1 ${countryFilter}
                    UNION
                    SELECT p."stateRaw" as name FROM "Parcel" p 
                    WHERE p."stateRaw" IS NOT NULL AND p."stateRaw" <> '' 
                    ${countryFilter}
                    UNION
                    SELECT p."provinceRaw" as name FROM "Parcel" p 
                    WHERE p."provinceRaw" IS NOT NULL AND p."provinceRaw" <> '' 
                    ${countryFilter}
                ) combined
                WHERE name IS NOT NULL AND name <> ''
                ORDER BY name
            `;
            const provinces = new Set<string>();
            result.forEach(r => {
                const fullName = ABBR_TO_PROVINCE[r.state] || r.state;
                provinces.add(fullName);
            });
            return NextResponse.json(dedupeDisplayValues(Array.from(provinces)));
        }

        if (distinct === 'cities') {
            // Filter by country and state if provided
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;

            let stateFilter = Prisma.sql``;
            if (state) {
                const terms = provinceSearchTerms(state);
                stateFilter = Prisma.sql`AND (
                    LOWER(p."stateRaw") IN (${Prisma.join(terms)}) OR
                    LOWER(p."provinceRaw") IN (${Prisma.join(terms)}) OR
                    EXISTS (SELECT 1 FROM "Province" pr WHERE pr.id = p."provinceId"
                        AND (LOWER(pr.name) IN (${Prisma.join(terms)}) OR LOWER(pr.code) IN (${Prisma.join(terms)})))
                 )`;
            }

            const result = await prisma.$queryRaw<{ city: string }[]>`
                SELECT DISTINCT name as city FROM (
                    SELECT c."name" FROM "City" c
                    JOIN "Parcel" p ON p."cityId" = c.id
                    WHERE 1=1 ${countryFilter} ${stateFilter}
                    UNION
                    SELECT p."cityRaw" as name FROM "Parcel" p 
                    WHERE p."cityRaw" IS NOT NULL AND p."cityRaw" <> '' 
                    ${countryFilter} ${stateFilter}
                ) combined
                WHERE name IS NOT NULL AND name <> ''
                ORDER BY name
             `;
            const cities = dedupeDisplayValues(result.map(r => r.city));
            return NextResponse.json(isCanada(country) ? filterOfficialCanadianCities(cities) : cities);
        }

        if (distinct === 'zips') {
            const countryFilter = country ? Prisma.sql`AND p.country = ${country}` : Prisma.sql``;
            let stateFilter = Prisma.sql``;
            if (state) {
                const terms = provinceSearchTerms(state);
                stateFilter = Prisma.sql`AND (
                    LOWER(p."stateRaw") IN (${Prisma.join(terms)}) OR
                    LOWER(p."provinceRaw") IN (${Prisma.join(terms)}) OR
                    EXISTS (SELECT 1 FROM "Province" pr WHERE pr.id = p."provinceId"
                        AND (LOWER(pr.name) IN (${Prisma.join(terms)}) OR LOWER(pr.code) IN (${Prisma.join(terms)})))
                 )`;
            }

            const result = await prisma.$queryRaw<{ zip: string }[]>`
                SELECT DISTINCT name as zip FROM (
                    SELECT p."postalCode" as name FROM "Parcel" p
                    WHERE p."postalCode" IS NOT NULL AND p."postalCode" <> ''
                    ${countryFilter} ${stateFilter}
                    UNION
                    SELECT p.zip as name FROM "Parcel" p
                    WHERE p.zip IS NOT NULL AND p.zip <> ''
                    ${countryFilter} ${stateFilter}
                ) combined
                WHERE name IS NOT NULL AND name <> ''
                ORDER BY name
            `;
            const zips = dedupeDisplayValues(result.map(r => r.zip));
            return NextResponse.json(isCanada(country) ? filterCanadianPostalCodes(zips) : zips);
        }

        if (distinct === 'filters') {
            // Parse the currently-selected filters so each dropdown can narrow by the others.
            const parse = (k: string) => (searchParams.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);
            const f: FacetFilters = {
                country,
                city: parse('city'), state: parse('state'), county: parse('county'), zip: parse('zip'),
                type: parse('type'), carrier: parse('carrier'), status: parse('status'),
            };
            const lj = needsParcel(f) ? Prisma.sql`JOIN "Parcel" p ON p."towerId" = t.id` : Prisma.empty;

            // One row per facet, each with its sorted values, in a single round trip.
            const facetResult = await prisma.$queryRaw<{ facet: string; values: string[] }[]>(Prisma.sql`
                SELECT facet, array_agg(DISTINCT value ORDER BY value) AS values
                FROM (
                    ${Prisma.join([
                        Prisma.sql`SELECT 'cities'::text AS facet, fc."name" AS value FROM "City" fc
                                JOIN "Parcel" p ON p."cityId" = fc.id
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'city'))}`,
                        Prisma.sql`SELECT 'cities' AS facet, p."cityRaw" AS value FROM "Parcel" p
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'city'), Prisma.sql`p."cityRaw" IS NOT NULL AND p."cityRaw" <> ''`)}`,
                        Prisma.sql`SELECT 'states' AS facet, fpr."name" AS value FROM "Province" fpr
                                JOIN "Parcel" p ON p."provinceId" = fpr.id
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'state'))}`,
                        Prisma.sql`SELECT 'states' AS facet, p."stateRaw" AS value FROM "Parcel" p
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'state'), Prisma.sql`p."stateRaw" IS NOT NULL AND p."stateRaw" <> ''`)}`,
                        Prisma.sql`SELECT 'states' AS facet, p."provinceRaw" AS value FROM "Parcel" p
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'state'), Prisma.sql`p."provinceRaw" IS NOT NULL AND p."provinceRaw" <> ''`)}`,
                        Prisma.sql`SELECT 'counties' AS facet, fco."name" AS value FROM "County" fco
                                JOIN "Parcel" p ON p."countyId" = fco.id
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'county'))}`,
                        Prisma.sql`SELECT 'counties' AS facet, p."county" AS value FROM "Parcel" p
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'county'), Prisma.sql`p."county" IS NOT NULL AND p."county" <> ''`)}`,
                        Prisma.sql`SELECT 'zips' AS facet, p."postalCode" AS value FROM "Parcel" p
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'zip'), Prisma.sql`p."postalCode" IS NOT NULL AND p."postalCode" <> ''`)}`,
                        Prisma.sql`SELECT 'zips' AS facet, p.zip AS value FROM "Parcel" p
                                JOIN "Tower" t ON t.id = p."towerId"
                                ${whereFrom(facetConds(f, 'zip'), Prisma.sql`p.zip IS NOT NULL AND p.zip <> ''`)}`,
                        Prisma.sql`SELECT 'types' AS facet, ft.name AS value FROM "TowerType" ft
                                JOIN "Tower" t ON t."typeId" = ft.id
                                ${lj}
                                ${whereFrom(facetConds(f, 'type'))}`,
                        Prisma.sql`SELECT 'carriers' AS facet, fca.name AS value FROM "Carrier" fca
                                JOIN "Tower" t ON t."carrierId" = fca.id
                                ${lj}
                                ${whereFrom(facetConds(f, 'carrier'))}`,
                        Prisma.sql`SELECT 'statuses' AS facet, fst.name AS value FROM "TowerStatus" fst
                                JOIN "Tower" t ON t."statusId" = fst.id
                                ${lj}
                                ${whereFrom(facetConds(f, 'status'))}`,
                    ], ' UNION ALL ')}
                ) all_facets
                WHERE value IS NOT NULL AND value <> ''
                GROUP BY facet
            `);

            const valuesByFacet: Record<string, string[]> = {};
            facetResult.forEach(r => { valuesByFacet[r.facet] = r.values; });

            const isCA = isCanada(country);
            const states = dedupeDisplayValues(
                (valuesByFacet.states || []).map(s => ABBR_TO_PROVINCE[s] || s)
            );
            const cities = dedupeDisplayValues(valuesByFacet.cities || []);
            const counties = dedupeDisplayValues(valuesByFacet.counties || []);
            const zips = dedupeDisplayValues(valuesByFacet.zips || []);
            return NextResponse.json({
                cities: isCA ? filterOfficialCanadianCities(cities) : cities,
                states,
                counties: isCA ? filterOfficialCanadianCounties(counties) : counties,
                zips: isCA ? filterCanadianPostalCodes(zips) : zips,
                types: dedupeDisplayValues(valuesByFacet.types || []),
                carriers: dedupeDisplayValues(valuesByFacet.carriers || []),
                statuses: dedupeDisplayValues(valuesByFacet.statuses || []),
            });
        }

        if (distinct === 'lookups') {
            // These four lookup tables only change on import, so serve a short in-process cache.
            if (lookupsCache && Date.now() - lookupsCache.at < LOOKUPS_TTL_MS) {
                return NextResponse.json(lookupsCache.data);
            }
            // One round trip for all three lists; parallel findMany calls held extra pool connections.
            const lookupRows = await prisma.$queryRaw<{ kind: string; id: number; name: string }[]>(Prisma.sql`
                SELECT 'types'::text AS kind, id, name FROM "TowerType"
                UNION ALL
                SELECT 'carriers', id, name FROM "Carrier"
                UNION ALL
                SELECT 'statuses', id, name FROM "TowerStatus"
                ORDER BY kind, name
            `);

            const types: { id: number; name: string }[] = [];
            const carriers: { id: number; name: string }[] = [];
            const statuses: { id: number; name: string }[] = [];
            for (const row of lookupRows) {
                if (row.kind === 'types') types.push({ id: row.id, name: row.name });
                else if (row.kind === 'carriers') carriers.push({ id: row.id, name: row.name });
                else statuses.push({ id: row.id, name: row.name });
            }

            const payload = {
                types,
                carriers,
                statuses
            };
            lookupsCache = { at: Date.now(), data: payload };
            return NextResponse.json(payload);
        }

        let whereClause: Prisma.TowerWhereInput = {};

        if (id) {
            whereClause = { id: parseInt(id, 10) };
        } else {
            // Build an array of conditions to AND together
            const andConditions: Prisma.TowerWhereInput[] = [];

            // Country filter
            if (country) {
                andConditions.push({
                    parcel: {
                        country: { equals: country, mode: 'insensitive' }
                    }
                });
            }

            // State filter - match on province-related fields only
            if (state) {
                const stateValues = state.split(',').filter(Boolean);
                const terms: string[] = [];
                stateValues.forEach(sv => {
                    terms.push(sv);
                    // Expand full name → abbreviation (e.g. "California" → "CA", "British Columbia" → "BC")
                    const abbr = PROVINCE_TO_ABBR[sv];
                    if (abbr) terms.push(abbr);
                    // Expand abbreviation → full name (e.g. "CA" → "California", "BC" → "British Columbia")
                    const fullName = ABBR_TO_PROVINCE[sv];
                    if (fullName) terms.push(fullName);
                });

                andConditions.push({
                    OR: [
                        // 1. Search in structured state/province raw columns
                        {
                            parcel: {
                                stateRaw: { in: terms, mode: 'insensitive' }
                            }
                        },
                        {
                            parcel: {
                                provinceRaw: { in: terms, mode: 'insensitive' }
                            }
                        },
                        // 2. Search in normalized Province relation (name and code)
                        {
                            parcel: {
                                province: { name: { in: terms, mode: 'insensitive' } }
                            }
                        },
                        {
                            parcel: {
                                province: { code: { in: terms, mode: 'insensitive' } }
                            }
                        }
                    ]
                });
            }

            // Bounding box filter
            if (bbox) {
                const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
                andConditions.push({
                    lat: { gte: minLat, lte: maxLat },
                    lon: { gte: minLon, lte: maxLon }
                });
            }

            // Build parcel filters
            const parcelFilters: any = {};

            if (city) {
                const cityValues = city.split(',').filter(Boolean);
                // Search both raw cityRaw and normalized City relation
                andConditions.push({
                    parcel: {
                        OR: [
                            { cityRaw: { in: cityValues, mode: 'insensitive' } },
                            { city: { name: { in: cityValues, mode: 'insensitive' } } }
                        ]
                    }
                });
            }

            if (county) {
                const countyValues = county.split(',').filter(Boolean);
                andConditions.push({
                    parcel: {
                        OR: [
                            { countyRaw: { in: countyValues, mode: 'insensitive' } },
                            { countyNormalized: { name: { in: countyValues, mode: 'insensitive' } } }
                        ]
                    }
                });
            }

            if (zip) {
                const zipValues = zip.split(',').filter(Boolean);
                // Search both postalCode and zip to match display logic
                andConditions.push({
                    parcel: {
                        OR: [
                            { postalCode: { in: zipValues, mode: 'insensitive' } },
                            { zip: { in: zipValues, mode: 'insensitive' } }
                        ]
                    }
                });
            }

            // Relation filters
            if (typeFilter) {
                const typeValues = typeFilter.split(',').filter(Boolean);
                andConditions.push({
                    type: {
                        name: { in: typeValues, mode: 'insensitive' }
                    }
                });
            }

            if (carrierFilter) {
                const carrierValues = carrierFilter.split(',').filter(Boolean);
                andConditions.push({
                    carrier: {
                        name: { in: carrierValues, mode: 'insensitive' }
                    }
                });
            }

            if (statusFilter) {
                const statusValues = statusFilter.split(',').filter(Boolean);
                andConditions.push({
                    status: { name: { in: statusValues, mode: 'insensitive' } }
                });
            }

            if (address) {
                andConditions.push({
                    parcel: {
                        address: { contains: address, mode: 'insensitive' }
                    }
                });
            }

            if (owner) {
                andConditions.push({
                    parcel: {
                        owner: {
                            name: { contains: owner, mode: 'insensitive' }
                        }
                    }
                });
            }

            // Has-owner-name filter (derived from parcel.ownerId)
            if (hasOwnerName === 'true') {
                andConditions.push({ parcel: { ownerId: { not: null } } });
            } else if (hasOwnerName === 'false') {
                andConditions.push({
                    OR: [
                        { parcel: { is: null } },
                        { parcel: { ownerId: null } }
                    ]
                });
            }

            // Business count filter
            if (minBusinessCount !== null || maxBusinessCount !== null) {
                const countFilter: any = {};
                if (minBusinessCount !== null) countFilter.gte = parseInt(minBusinessCount, 10);
                if (maxBusinessCount !== null) countFilter.lte = parseInt(maxBusinessCount, 10);
                andConditions.push({ businessCount: countFilter });
            }

            // Avg distance filter
            if (minAvgDistance !== null || maxAvgDistance !== null) {
                const distFilter: any = {};
                if (minAvgDistance !== null) distFilter.gte = parseFloat(minAvgDistance);
                if (maxAvgDistance !== null) distFilter.lte = parseFloat(maxAvgDistance);
                andConditions.push({ avgBusinessDistance: distFilter });
            }

            // AI score filter (UI sends 0-100%, DB stores 0-1)
            if (minAiScore !== null || maxAiScore !== null) {
                const scoreFilter: any = {};
                if (minAiScore !== null) scoreFilter.gte = parseFloat(minAiScore) / 100;
                if (maxAiScore !== null) scoreFilter.lte = parseFloat(maxAiScore) / 100;
                andConditions.push({ aiTowerScore: scoreFilter });
            }

            // Add parcel filters as a single condition if any exist
            if (Object.keys(parcelFilters).length > 0) {
                andConditions.push({
                    parcel: parcelFilters
                });
            }

            // Global search filter
            if (search) {
                const trimmed = search.trim();
                // Pasted address: one ILIKE on Parcel.address. Per-term across all 16 columns times out the connection pool (P1017).
                const isAddressQuery = trimmed.includes(',') || /\b[a-z]\d[a-z]\s+\d[a-z]\d\b/i.test(trimmed);

                if (isAddressQuery) {
                    andConditions.push({
                        parcel: { address: { contains: trimmed, mode: 'insensitive' } }
                    });
                } else {
                    const searchTerms = trimmed.split(/\s+/).filter(Boolean);

                    // For each term, it must match at least one field (AND of ORs)
                    searchTerms.forEach(term => {
                        const searchTermStr = term;
                        andConditions.push({
                            OR: [
                                { parcel: { address: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { cityRaw: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { city: { name: { contains: searchTermStr, mode: 'insensitive' } } } },
                                { parcel: { countyRaw: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { countyNormalized: { name: { contains: searchTermStr, mode: 'insensitive' } } } },
                                { parcel: { stateRaw: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { provinceRaw: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { province: { name: { contains: searchTermStr, mode: 'insensitive' } } } },
                                { parcel: { postalCode: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { zip: { contains: searchTermStr, mode: 'insensitive' } } },
                                { parcel: { owner: { name: { contains: searchTermStr, mode: 'insensitive' } } } },
                                { legacyStatus: { contains: searchTermStr, mode: 'insensitive' } },
                                { status: { name: { contains: searchTermStr, mode: 'insensitive' } } },
                                { type: { name: { contains: searchTermStr, mode: 'insensitive' } } },
                                { carrier: { name: { contains: searchTermStr, mode: 'insensitive' } } },
                                { notes: { some: { content: { contains: searchTermStr, mode: 'insensitive' } } } }
                            ]
                        });
                    });
                }
            }

            // Combine all conditions with AND
            if (andConditions.length > 0) {
                whereClause = {
                    AND: andConditions
                };
            }
        }

        // Apply role-based access control
        whereClause = buildTowerAccessFilter(user.id, user.role, whereClause);

        // Calculate pagination
        const skip = page !== undefined && limit !== undefined ? page * limit : undefined;
        const take = limit;

        // If pagination is requested, also get total count
        const needsCount = page !== undefined && limit !== undefined;

        const [towers, totalCount] = await Promise.all([
            prisma.tower.findMany({
                // relationJoins (prisma/schema.prisma) loads all includes in one round trip, which is what stopped the P2024 pool timeouts.
                where: whereClause,
                include: {
                    parcel: {
                        include: {
                            owner: true,
                            city: true,
                            province: true,
                            countyNormalized: true
                        }
                    },
                    type: true,
                    carrier: true,
                    status: true,
                    _count: {
                        select: { notes: true }
                    }
                },
                orderBy: (() => {
                    const sort = searchParams.get('sort');
                    const order = (searchParams.get('order') || 'asc') as Prisma.SortOrder;
                    const byField: Record<string, Prisma.TowerOrderByWithRelationInput> = {
                        businessCount: { businessCount: order },
                        avgBusinessDistance: { avgBusinessDistance: order },
                        aiTowerScore: { aiTowerScore: { sort: order, nulls: 'last' } as Prisma.SortOrderInput },
                        hasOwnerName: { parcel: { ownerId: order } },
                        id: { id: order },
                    };
                    const primary = byField[sort ?? ''] ?? { id: 'asc' as Prisma.SortOrder };
                    // Always an array: a single object breaks Prisma's findMany overload once relationLoadStrategy is set. The id tiebreaker keeps one row per page.
                    return [primary, { id: order }] as Prisma.TowerOrderByWithRelationInput[];
                })(),
                skip,
                take
            }),
            needsCount ? prisma.tower.count({ where: whereClause }) : Promise.resolve(undefined)
        ]);

        const withFlags = towers.map(t => ({
            ...t,
            hasOwnerName: Boolean(t.parcel?.ownerId)
        }));

        // If pagination was used, return both data and count
        if (needsCount) {
            return NextResponse.json({
                data: withFlags,
                total: totalCount,
                page: page,
                limit: limit
            });
        }

        return NextResponse.json(withFlags);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching towers:', error);
        return NextResponse.json({ error: 'Failed to fetch towers' }, { status: 500 });
    }
}

// POST /api/towers - Create a new tower
// Any authenticated user may create; field drops (source='field') auto-assign to the creator
// so CALLERs can see their own creation under the per-user access filter.
export async function POST(request: Request) {
    try {
        const user = await getAuthUser();

        const body = await request.json();
        const { lat, lon, type, status, source } = body;

        if (!lat || !lon) {
            return NextResponse.json({ error: 'Latitude and Longitude are required' }, { status: 400 });
        }

        // Manual findOrCreate for type and status since names are no longer unique.
        // Match case-insensitively on the trimmed name so we reuse an existing lookup
        // rather than spawning "New" / "new" / "New " duplicates.
        let typeId = undefined;
        if (type && type.trim()) {
            const typeName = type.trim();
            const existingType = await prisma.towerType.findFirst({ where: { name: { equals: typeName, mode: 'insensitive' } } });
            typeId = existingType?.id ?? (await prisma.towerType.create({ data: { name: typeName } })).id;
        }

        let statusId = undefined;
        const statusName = (status && status.trim()) || 'New';
        const existingStatus = await prisma.towerStatus.findFirst({ where: { name: { equals: statusName, mode: 'insensitive' } } });
        statusId = existingStatus?.id ?? (await prisma.towerStatus.create({ data: { name: statusName } })).id;

        const resolvedSource = typeof source === 'string' && source.length > 0 ? source : undefined;

        // Upsert: Create if not found, or update if exists (though usually we just want to return existing)
        // Using upsert ensures we don't violate unique constraint
        const tower = await prisma.tower.upsert({
            where: {
                lat_lon: {
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                }
            },
            update: {
                typeId: typeId || undefined,
                statusId: statusId,
                legacyStatus: status || undefined
            },
            create: {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                typeId: typeId || undefined,
                statusId: statusId,
                legacyStatus: status || 'New',
                source: resolvedSource ?? undefined
            }
        });

        if (resolvedSource === 'field') {
            await prisma.towerAssignment.upsert({
                where: { userId_towerId: { userId: user.id, towerId: tower.id } },
                update: {},
                create: { userId: user.id, towerId: tower.id, assignedBy: user.id }
            });
        }

        return NextResponse.json(tower);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error creating tower:', error);
        return NextResponse.json({ error: 'Failed to create tower' }, { status: 500 });
    }
}
