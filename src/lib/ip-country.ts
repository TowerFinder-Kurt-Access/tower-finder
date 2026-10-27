/**
 * Read-time IP to country resolution.
 *
 * `LoginEvent` stores no country, so the page resolves it when it reads. This
 * module is server-only: it calls api.country.is, which needs no key. Results
 * cache per server instance, concurrency is bounded, and every failure returns
 * null so a slow third party never blocks the table.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 800;
const TOTAL_BUDGET_MS = 2000;
const CONCURRENCY = 10;
const MAX_LOOKUPS = 100;
const MAX_CACHE_ENTRIES = 5000;

interface CacheEntry {
    country: string | null;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const PRIVATE_V4 = [
    /^0\./,
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
];
const PRIVATE_V6 = [
    /^::$/,
    /^::1$/,
    /^f[cd]/i,
    /^fe[89ab]/i,
    /^::ffff:(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i,
];

/** Loopback, link-local, and RFC1918 addresses cannot be geolocated. */
export function isPublicIp(ip: string): boolean {
    const value = ip.trim();
    if (!value) return false;

    if (IPV4.test(value)) {
        const octets = value.split('.').map(Number);
        if (octets.some((octet) => octet > 255)) return false;
        return !PRIVATE_V4.some((pattern) => pattern.test(value));
    }

    if (value.includes(':') && /^[0-9a-fA-F:]+$/.test(value)) {
        return !PRIVATE_V6.some((pattern) => pattern.test(value));
    }

    return false;
}

/** Keeps the value safe to place in a URL path segment. */
function isLookupSafe(ip: string): boolean {
    return /^[0-9a-fA-F:.]+$/.test(ip);
}

async function lookup(ip: string): Promise<string | null> {
    const response = await fetch(`https://api.country.is/${ip}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        headers: { accept: 'application/json' },
    });
    // 404 means the address has no registered country, which is not an error.
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return null;

    const country = (payload as { country?: unknown }).country;
    return typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : null;
}

function pruneCache(): void {
    if (cache.size <= MAX_CACHE_ENTRIES) return;

    const now = Date.now();
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
    // Map keeps insertion order, so the first keys are the oldest.
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
    }
}

/**
 * Resolves ISO 3166-1 alpha-2 codes for the given IPs. Returns only the
 * addresses it could place, so callers treat a missing key as unknown.
 */
export async function resolveCountries(
    ips: ReadonlyArray<string | null | undefined>
): Promise<Map<string, string>> {
    const unique = [...new Set(ips.filter((ip): ip is string => typeof ip === 'string' && ip.length > 0))];
    const resolved = new Map<string, string>();
    const pending: string[] = [];
    const now = Date.now();

    for (const ip of unique) {
        const cached = cache.get(ip);
        if (cached && cached.expiresAt > now) {
            if (cached.country) resolved.set(ip, cached.country);
            continue;
        }
        if (!isPublicIp(ip) || !isLookupSafe(ip)) {
            cache.set(ip, { country: null, expiresAt: now + MISS_TTL_MS });
            continue;
        }
        pending.push(ip);
    }

    const queue = pending.slice(0, MAX_LOOKUPS);
    const startedAt = Date.now();
    let deadChunks = 0;

    for (let index = 0; index < queue.length; index += CONCURRENCY) {
        // A page load must not wait on a slow third party, so the whole pass
        // gets a fixed budget and bails out after repeated dead chunks.
        if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;

        const chunk = queue.slice(index, index + CONCURRENCY);
        const results = await Promise.allSettled(
            chunk.map(async (ip) => {
                const country = await lookup(ip);
                cache.set(ip, {
                    country,
                    expiresAt: Date.now() + (country ? CACHE_TTL_MS : MISS_TTL_MS),
                });
                return { ip, country };
            })
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.country) {
                resolved.set(result.value.ip, result.value.country);
            }
        }

        deadChunks = results.some((result) => result.status === 'fulfilled') ? 0 : deadChunks + 1;
        if (deadChunks >= 2) break;
    }

    pruneCache();
    return resolved;
}
