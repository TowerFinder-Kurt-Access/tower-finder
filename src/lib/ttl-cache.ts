interface Entry<T> {
    value: T;
    expiresAt: number;
}

export interface TtlCache<T> {
    get(key: string): T | null;
    set(key: string, value: T): void;
    clear(): void;
    readonly size: number;
}

/**
 * Small per-instance TTL cache for read-heavy endpoints. Values expire on read,
 * and the oldest entries drop once the map passes `maxEntries`.
 *
 * Serverless instances each keep their own copy, so treat this as a short-lived
 * speedup rather than a source of truth.
 */
export function createTtlCache<T>(ttlMs: number, maxEntries = 500): TtlCache<T> {
    const store = new Map<string, Entry<T>>();

    const prune = (now: number) => {
        for (const [key, entry] of store) {
            if (entry.expiresAt <= now) store.delete(key);
        }
        // Map keeps insertion order, so the first keys are the oldest.
        while (store.size > maxEntries) {
            const oldest = store.keys().next();
            if (oldest.done) break;
            store.delete(oldest.value);
        }
    };

    return {
        get(key) {
            const entry = store.get(key);
            if (!entry) return null;
            if (entry.expiresAt <= Date.now()) {
                store.delete(key);
                return null;
            }
            return entry.value;
        },
        set(key, value) {
            store.set(key, { value, expiresAt: Date.now() + ttlMs });
            if (store.size > maxEntries) prune(Date.now());
        },
        clear() {
            store.clear();
        },
        get size() {
            return store.size;
        },
    };
}
