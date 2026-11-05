// Lease Expiry urgency window: a lease counts as urgent once it is expired
// or expires within this many days.
export const LEASE_URGENT_DAYS = 60;

/** YYYY-MM-DD in the machine's local calendar; the date input's "today". */
export function toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Earliest selectable Lease Expiry (the user's today) as YYYY-MM-DD. */
export function minLeaseExpiryDate(): string {
    return toLocalDateString(new Date());
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The calendar day a Lease Expiry value refers to, as YYYY-MM-DD. Date-only
 * strings are days already; anything with a time is read in UTC, because the
 * API serializes the stored timestamp in UTC and every surface must agree on
 * the day no matter which timezone the viewer is in.
 */
function leaseExpiryDay(value: string | Date): string | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    if (value.includes('T')) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    }
    return DATE_ONLY_RE.test(value) ? value : null;
}

/**
 * Today for past-date checks. Prefers the browser-supplied local date: the
 * server cannot know the user's timezone, and on a UTC server (Vercel) a
 * west-of-UTC user's evening "today" would otherwise read as the past.
 * Accepted only within one day of UTC today; anything else falls back to UTC.
 */
function resolveToday(clientToday?: unknown): string {
    const utcToday = new Date().toISOString().slice(0, 10);
    if (typeof clientToday !== 'string' || !DATE_ONLY_RE.test(clientToday)) return utcToday;
    const diffDays = Math.round((Date.parse(`${clientToday}T00:00:00Z`) - Date.parse(`${utcToday}T00:00:00Z`)) / DAY_MS);
    return Math.abs(diffDays) <= 1 ? clientToday : utcToday;
}

export function isLeaseExpiryInPast(value: string, clientToday?: unknown): boolean {
    const day = leaseExpiryDay(value);
    return !!day && day < resolveToday(clientToday);
}

/** Urgent = expired today or expiring within LEASE_URGENT_DAYS. Null/invalid = not urgent. */
export function isLeaseExpiryUrgent(value: string | Date | null | undefined, now: Date = new Date()): boolean {
    const day = value ? leaseExpiryDay(value) : null;
    if (!day) return false;
    const cutoff = new Date(now.getTime() + LEASE_URGENT_DAYS * DAY_MS);
    return day <= cutoff.toISOString().slice(0, 10);
}

/** Human-readable Lease Expiry, e.g. "Nov 5, 2026". Empty string for null/invalid. */
export function formatLeaseExpiry(value: string | Date | null | undefined): string {
    const day = value ? leaseExpiryDay(value) : null;
    if (!day) return '';
    return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Parse an untrusted request value into a Date for storage; null when not a usable date. */
export function parseLeaseExpiryDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    if (!DATE_ONLY_RE.test(value) && !value.includes('T')) return null;
    // Date-only input anchors to the server's local midnight; UTC servers
    // (Vercel) therefore store UTC midnight, which keeps the calendar day.
    const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}
