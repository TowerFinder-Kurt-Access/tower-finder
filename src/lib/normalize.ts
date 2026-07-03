/**
 * Normalization helpers for filter dropdown values.
 *
 * The `distinct=*` API endpoints pull values straight from raw text columns, so the
 * same real-world value can appear multiple times differing only by surrounding
 * whitespace or letter case ("Toronto" / "toronto" / "Toronto "). These helpers
 * collapse those variants into a single, well-cased entry.
 */

/** Grouping key: trimmed + lower-cased. Two values sharing a key are "the same". */
export function normalizeKey(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Rank a variant's casing so we can pick the nicest representative:
 * mixed-case ("Toronto") beats all-caps ("TELUS") beats all-lower ("toronto").
 */
function caseScore(value: string): number {
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    if (hasUpper && hasLower) return 2;
    if (hasUpper) return 1;
    return 0;
}

function isBetterRepresentative(candidate: string, current: string): boolean {
    const cs = caseScore(candidate);
    const ss = caseScore(current);
    if (cs !== ss) return cs > ss;
    // Deterministic tie-break.
    return candidate.localeCompare(current) < 0;
}

/**
 * Collapse raw values into a sorted list of unique display strings. Variants that
 * differ only by surrounding whitespace or case are merged; the best-cased variant
 * is kept. Nullish and empty values are dropped.
 */
export function dedupeDisplayValues(values: (string | null | undefined)[]): string[] {
    const byKey = new Map<string, string>();
    for (const raw of values) {
        if (raw == null) continue;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        const current = byKey.get(key);
        if (!current || isBetterRepresentative(trimmed, current)) {
            byKey.set(key, trimmed);
        }
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}
