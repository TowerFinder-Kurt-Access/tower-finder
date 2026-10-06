import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { GeoapifyService } from '@/services/GeoapifyService';
import { enqueueJob } from '@/lib/job-queue';

interface NearbyBusinessRow {
    name: string;
    phone: string | null;
    distance: number;
    rawData: Prisma.InputJsonValue;
    towerId: number;
}

/** One tower's entry in a Geoapify batch payload. */
interface GeoapifyBatchEntry {
    error?: unknown;
    result?: unknown;
}

/** A Geoapify GeoJSON feature reduced to the fields we store and filter on. */
interface GeoapifyFeature {
    raw: Prisma.InputJsonValue;
    name: string | null;
    placeId: string | null;
    phone: string | null;
    distance: number;
    categories: unknown;
}

/** Validates a tower's third-party features; the phone arrives as a string or a number. */
function readFeatures(result: unknown): GeoapifyFeature[] {
    if (!result || typeof result !== 'object' || !('features' in result)) return [];
    const { features } = result;
    if (!Array.isArray(features)) return [];

    const parsed: GeoapifyFeature[] = [];
    for (const feature of features) {
        if (!feature || typeof feature !== 'object' || !('properties' in feature)) continue;
        const { properties } = feature;
        if (!properties || typeof properties !== 'object') continue;

        // One boundary assertion: every field read below is still checked before use.
        const props = properties as Record<string, unknown>;
        const contact = props.contact;
        const phone = contact && typeof contact === 'object' && 'phone' in contact ? contact.phone : undefined;

        parsed.push({
            // Parsed JSON is always a valid Json column value; Prisma cannot infer that from `object`.
            raw: feature as unknown as Prisma.InputJsonValue,
            name: typeof props.name === 'string' && props.name.length > 0 ? props.name : null,
            placeId: typeof props.place_id === 'string' && props.place_id.length > 0 ? props.place_id : null,
            phone: typeof phone === 'string' && phone.length > 0
                ? phone
                : typeof phone === 'number' ? String(phone) : null,
            distance: typeof props.distance === 'number' && Number.isFinite(props.distance) ? props.distance : 0,
            categories: props.categories
        });
    }
    return parsed;
}

/** True when a place is a public service rather than a business. */
function isNonBusinessCategory(categories: unknown): boolean {
    if (!Array.isArray(categories)) return false;
    return categories.some(
        (category) =>
            typeof category === 'string' &&
            GeoapifyService.NON_BUSINESS_CATEGORIES.some(
                (excluded) => category === excluded || category.startsWith(`${excluded}.`)
            )
    );
}

/** Finds unprocessed towers and submits a Geoapify batch for them. */
export async function submitGeoapifyBatch(): Promise<Record<string, unknown>> {
    const towers = await prisma.tower.findMany({
        where: { placesProcessedAt: null },
        take: 100, // Process 100 at a time to stay safe within batch limits and timeouts
        select: { id: true, lat: true, lon: true }
    });

    if (towers.length === 0) {
        return { message: 'No towers to process' };
    }

    const batchId = await GeoapifyService.submitPlacesBatch(towers);

    // Schedule a poll job in 5 minutes
    await enqueueJob(
        'poll_geoapify_batch',
        { batchId, towerIds: towers.map(t => t.id) },
        new Date(Date.now() + 5 * 60 * 1000)
    );

    return { batchId, towerCount: towers.length };
}

/** Stores the batch results once Geoapify finishes processing. */
export async function pollGeoapifyBatch(params: { batchId: string, towerIds: number[] }): Promise<Record<string, unknown>> {
    const { batchId, towerIds } = params;

    const statusResult = await GeoapifyService.getBatchResult(batchId);

    if (statusResult.status === 'pending') {
        console.log(`[Geoapify Job] Batch ${batchId} still pending. Rescheduling poll...`);
        // Schedule a NEW poll job in 5 minutes
        await enqueueJob(
            'poll_geoapify_batch',
            params,
            new Date(Date.now() + 5 * 60 * 1000)
        );
        return { status: 'pending', batchId, message: 'Batch still pending, rescheduled' };
    }

    // Geoapify answers with { results: [{ result: { features } }] }, one entry per tower.
    const payload = statusResult.results as { results?: GeoapifyBatchEntry[] } | null;
    const towerResults = Array.isArray(payload?.results) ? payload.results : [];

    let totalBusinesses = 0;

    for (let i = 0; i < towerIds.length; i++) {
        const towerId = towerIds[i];
        const towerResult = towerResults[i];

        if (!towerResult || towerResult.error) {
            console.error(`[Geoapify Job] Error for tower ${towerId}:`, towerResult?.error);
            // Mark it as processed so we don't retry forever
            await prisma.tower.update({
                where: { id: towerId },
                data: { placesProcessedAt: new Date() }
            });
            continue;
        }

        const businesses: NearbyBusinessRow[] = [];
        const seen = new Set<string>();
        const features = readFeatures(towerResult.result);

        for (const feature of features) {
            // Unnamed places and public services are not callable leads.
            if (!feature.name || isNonBusinessCategory(feature.categories)) continue;

            // The same place can come back once per matching category.
            if (feature.placeId) {
                if (seen.has(feature.placeId)) continue;
                seen.add(feature.placeId);
            }

            businesses.push({
                name: feature.name,
                phone: feature.phone,
                distance: feature.distance,
                rawData: feature.raw,
                towerId
            });
        }

        // Geoapify returns nearest-first, but we re-sort so the stored order is guaranteed.
        businesses.sort((a, b) => a.distance - b.distance);

        // Delete existing nearby businesses for this tower before adding new ones
        await prisma.businessNearby.deleteMany({ where: { towerId } });

        // Save new businesses
        if (businesses.length > 0) {
            await prisma.businessNearby.createMany({ data: businesses });
        }

        // Calculate summary stats
        const avgDistance = businesses.length > 0
            ? businesses.reduce((sum, b) => sum + b.distance, 0) / businesses.length
            : null;

        await prisma.tower.update({
            where: { id: towerId },
            data: {
                businessCount: businesses.length,
                avgBusinessDistance: avgDistance,
                placesProcessedAt: new Date()
            }
        });

        totalBusinesses += businesses.length;
    }

    // Continue the cycle while towers remain unprocessed.
    const remainingCount = await prisma.tower.count({
        where: { placesProcessedAt: null }
    });

    if (remainingCount > 0) {
        console.log(`[Geoapify Job] ${remainingCount} towers remaining. Enqueueing next batch...`);
        await enqueueJob('submit_geoapify_batch', {});
    }

    return {
        status: 'completed',
        towerCount: towerIds.length,
        businessCount: totalBusinesses,
        remainingTowers: remainingCount
    };
}
