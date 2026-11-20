import { prisma } from '@/lib/prisma';
import { parseLeaseExpiryDate } from '@/lib/lease-expiry';
import { cleanText, cleanPersonName } from '@/lib/leads';
import { enqueueJob } from '@/lib/job-queue';
import { addressQuery, type CsvRow, type ImportCountry } from '@/lib/tower-csv-import';

export interface ImportOutcome {
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
}

interface Geocoded {
    lat: number;
    lon: number;
    stateCode: string | null;
    county: string | null;
    city: string | null;
    zip: string | null;
    countryCode: string | null;
}

const GEOAPIFY_URL = 'https://api.geoapify.com/v1/geocode/search';
const GEOAPIFY_CONCURRENCY = 5;
const GEOAPIFY_RETRIES = 2;

/**
 * Geocodes one address. Returns null when the service finds no match or the
 * key is missing, so the row reports a clear error instead of inventing a point.
 */
async function geocode(query: string, country: ImportCountry): Promise<Geocoded | null> {
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) return null;
    const url = `${GEOAPIFY_URL}?text=${encodeURIComponent(query)}&format=json&limit=1`
        + `&filter=countrycode:${country === 'Canada' ? 'ca' : 'us'}&apiKey=${key}`;

    for (let attempt = 1; attempt <= GEOAPIFY_RETRIES; attempt += 1) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Geoapify HTTP ${response.status}`);
            const payload = await response.json() as { results?: Record<string, unknown>[] };
            const hit = payload.results?.[0];
            const lat = Number(hit?.lat);
            const lon = Number(hit?.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return {
                lat,
                lon,
                stateCode: typeof hit?.state_code === 'string' ? hit.state_code : null,
                county: typeof hit?.county === 'string' ? hit.county : null,
                city: typeof hit?.city === 'string' ? hit.city : null,
                zip: typeof hit?.postcode === 'string' ? hit.postcode : null,
                countryCode: typeof hit?.country_code === 'string' ? hit.country_code : null,
            };
        } catch (error) {
            if (attempt === GEOAPIFY_RETRIES) throw error;
            const { promise, resolve } = Promise.withResolvers<void>();
            setTimeout(resolve, attempt * 400);
            await promise;
        }
    }
    return null;
}

/** Geocode in small batches so a slow provider cannot stall the whole request. */
async function geocodeAll(rows: CsvRow[]): Promise<Map<number, Geocoded | null>> {
    const results = new Map<number, Geocoded | null>();
    const queue = [...rows];
    const workers = Array.from({ length: Math.min(GEOAPIFY_CONCURRENCY, queue.length) }, async () => {
        for (let row = queue.shift(); row; row = queue.shift()) {
            results.set(row.row, await geocode(addressQuery(row), row.country));
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * Write validated CSV rows into the Tower list.
 *
 * Each row is geocoded from its address. A tower within 25 m of the geocoded
 * point is treated as the same site and updated, so a corrected file fixes the
 * row instead of adding a duplicate. Optional columns update only when filled.
 * New towers are queued for the nightly Geoapify business-count job.
 */
export async function importTowerRows(
    rows: CsvRow[],
    userEmail: string,
    source = 'CSV Import',
): Promise<ImportOutcome> {
    const errors: { row: number; message: string }[] = [];
    const points = await geocodeAll(rows);
    if (!process.env.GEOAPIFY_API_KEY) {
        return { created: 0, updated: 0, skipped: rows.length, errors: [{ row: 0, message: 'GEOAPIFY_API_KEY is not set, so addresses cannot be geocoded' }] };
    }

    const [types, statuses] = await Promise.all([
        prisma.towerType.findMany({ select: { id: true, name: true } }),
        prisma.towerStatus.findMany({ select: { id: true, name: true } }),
    ]);
    const typeIds = new Map(types.map((entry) => [entry.name.toLowerCase(), entry.id]));
    const defaultStatusId = statuses.find((entry) => entry.name.toLowerCase() === 'new')?.id
        ?? (await prisma.towerStatus.create({ data: { name: 'New' } })).id;

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const point = points.get(row.row);
        if (!point) {
            errors.push({ row: row.row, message: `Could not geocode "${addressQuery(row)}"` });
            skipped += 1;
            continue;
        }
        if (point.countryCode && point.countryCode.toLowerCase() !== (row.country === 'Canada' ? 'ca' : 'us')) {
            errors.push({ row: row.row, message: `The geocoder placed this address outside ${row.country}` });
            skipped += 1;
            continue;
        }

        try {
            let typeId: number | null = null;
            const typeName = cleanText(row.typeName);
            if (typeName) {
                const key = typeName.toLowerCase();
                typeId = typeIds.get(key) ?? (await prisma.towerType.create({ data: { name: typeName } })).id;
                typeIds.set(key, typeId);
            }

            // Only a row this importer created is updated. Matching any nearby
            // tower would overwrite an Excel- or API-sourced parcel, which the
            // import cannot legitimately claim. 25 m because the geocoder
            // snaps an address to a building, so the same address must land on
            // the same tower across re-imports.
            const existing = await prisma.tower.findFirst({
                where: {
                    source,
                    lat: { gte: point.lat - 0.00025, lte: point.lat + 0.00025 },
                    lon: { gte: point.lon - 0.00025, lte: point.lon + 0.00025 },
                },
                select: { id: true },
            });

            // Existing parcels store Title Case for Canada and lower case for the
            // USA; the import writes the same shape so list cells and facets match.
            const nameCase = (value: string) => (row.country === 'Canada' ? value : value.toLowerCase());
            const parcelValues = {
                address: row.address,
                cityRaw: nameCase(row.city),
                countyRaw: nameCase(row.county),
                stateRaw: row.country === 'USA' ? row.stateCode : null,
                provinceRaw: row.country === 'Canada' ? row.stateCode : null,
                postalCode: row.country === 'Canada' ? row.zip : null,
                zip: row.country === 'USA' ? row.zip : null,
                country: row.country,
                // null when the file had no readable date, so the parcel keeps
                // no expiry rather than a guessed one.
                leaseExpiry: parseLeaseExpiryDate(row.leaseExpiry),
                dataSource: source,
            };

            const contact = cleanPersonName(row.contactPerson);
            const ownerName = cleanText(row.ownerName);
            const notes = cleanText(row.notes);

            await prisma.$transaction(async (tx) => {
                const tower = existing
                    ? await tx.tower.update({
                        where: { id: existing.id },
                        data: { typeId: typeId ?? undefined },
                    })
                    : await tx.tower.create({
                        data: {
                            lat: point.lat,
                            lon: point.lon,
                            typeId: typeId ?? undefined,
                            statusId: defaultStatusId,
                            source,
                            rawImportData: { ...row.raw, _importedBy: userEmail },
                        },
                    });

                const parcelUpdate = Object.fromEntries(
                    Object.entries(parcelValues).filter(([, value]) => value !== null),
                );

                let ownerId: number | undefined;
                if (ownerName) {
                    ownerId = (await tx.owner.findFirst({ where: { name: ownerName }, select: { id: true } })
                        ?? await tx.owner.create({ data: { name: ownerName }, select: { id: true } })).id;
                }

                await tx.parcel.upsert({
                    where: { towerId: tower.id },
                    update: ownerId ? { ...parcelUpdate, ownerId } : parcelUpdate,
                    create: { ...parcelValues, towerId: tower.id, ownerId },
                });

                // The lead carries the contact person the list shows.
                if (contact) {
                    const lead = await tx.lead.findFirst({
                        where: { towerId: tower.id },
                        orderBy: [{ stage: 'asc' }, { id: 'asc' }],
                        select: { id: true },
                    });
                    if (lead) await tx.lead.update({ where: { id: lead.id }, data: { contactPerson: contact } });
                    else {
                        await tx.lead.create({
                            data: {
                                towerId: tower.id,
                                stage: 'PROSPECTIVE',
                                contactPerson: contact,
                                companyName: ownerName,
                            },
                        });
                    }
                }

                if (notes) {
                    const existingNote = await tx.note.findFirst({
                        where: { towerId: tower.id, content: notes },
                        select: { id: true },
                    });
                    if (!existingNote) {
                        await tx.note.create({
                            data: { towerId: tower.id, content: notes, initials: 'CSV' },
                        });
                    }
                }
            }, { timeout: 30000, maxWait: 15000 });

            if (existing) updated += 1;
            else created += 1;
        } catch (error) {
            errors.push({ row: row.row, message: error instanceof Error ? error.message : String(error) });
            skipped += 1;
        }
    }

    // Business counts come from the nightly cron; queue a batch so new towers
    // are not left blank until tomorrow's run.
    if (created > 0) {
        try {
            await enqueueJob('submit_geoapify_batch', {});
        } catch (error) {
            console.error('Could not queue the business-count job after CSV import:', error);
        }
    }

    return { created, updated, skipped, errors };
}
