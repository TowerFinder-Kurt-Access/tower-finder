/**
 * Pure helpers for recovering the correct city and postal code from a parcel's full
 * geocoded `address` string (Nominatim-style, comma-separated), validating the city
 * against the official StatsCan municipality list. Shared by the API, the
 * LocationNormalizationService, and the maintenance scripts so they all agree.
 *
 * Imports are relative (not "@/") so tsx-run scripts can import this file too.
 */
import { PROVINCE_TO_ABBR, ABBR_TO_PROVINCE } from './locations';

export const POSTAL_FULL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
export const POSTAL_FSA_RE = /^[A-Za-z]\d[A-Za-z]$/;

// Leading municipal-status words that dress up an otherwise-bare municipality name.
// Deliberately excludes "county of" / "regional district" / "rural municipality of" /
// "municipal district of" so a rural division never collapses onto a same-named city.
const STRIP_PREFIXES = [
    'district municipality of ',
    'city of ', 'town of ', 'village of ', 'district of ',
    'municipality of ', 'township of ', 'resort village of ',
    'northern village of ', 'northern hamlet of ', 'corporation of the ', 'the ',
];

/** Lowercase + strip accents so "Montréal" and "Montreal" compare equal. */
function stripDiacritics(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeCityName(s: string): string {
    let v = stripDiacritics(s.trim().toLowerCase());
    for (const p of STRIP_PREFIXES) {
        if (v.startsWith(p)) { v = v.slice(p.length); break; }
    }
    return v.trim();
}

/** Resolve a province code (e.g. "ON") from a raw value and/or the address string. */
export function provinceCodeFrom(raw: string | null | undefined, address?: string | null): string | null {
    if (raw) {
        const t = raw.trim();
        if (/^[A-Za-z]{2}$/.test(t) && ABBR_TO_PROVINCE[t.toUpperCase()]) return t.toUpperCase();
        if (PROVINCE_TO_ABBR[t]) return PROVINCE_TO_ABBR[t];
        const found = Object.keys(PROVINCE_TO_ABBR).find(n => n.toLowerCase() === t.toLowerCase());
        if (found) return PROVINCE_TO_ABBR[found];
    }
    if (address) {
        const lower = address.toLowerCase();
        for (const name of Object.keys(PROVINCE_TO_ABBR)) {
            if (lower.includes(name.toLowerCase())) return PROVINCE_TO_ABBR[name];
        }
    }
    return null;
}

/** Map normalized municipality name -> canonical official name, for one province. */
export function buildOfficialLookup(cities: string[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const c of cities) {
        const k = normalizeCityName(c);
        if (k && !m.has(k)) m.set(k, c);
    }
    return m;
}

/** Extract a Canadian postal code from the address; prefer a full code over an FSA. */
export function extractPostalCode(address: string): string | null {
    const tokens = address.split(',').map(t => t.trim());
    let fsa: string | null = null;
    for (const t of tokens) {
        if (POSTAL_FULL_RE.test(t)) {
            const compact = t.toUpperCase().replace(/\s+/g, '');
            return `${compact.slice(0, 3)} ${compact.slice(3)}`;
        }
        if (POSTAL_FSA_RE.test(t) && !fsa) fsa = t.toUpperCase();
    }
    return fsa;
}

/**
 * Pick the correct city token from the address by validating against the official
 * list. The leftmost match wins: Nominatim orders components inner -> outer, so the
 * first token that is a real municipality is the one containing the point (a more
 * specific city beats an enclosing one when a boundary address lists both).
 */
export function extractCity(
    address: string,
    officialLookup: Map<string, string>,
    provinceName?: string | null
): string | null {
    const tokens = address.split(',').map(t => t.trim()).filter(Boolean);
    const provLower = provinceName ? normalizeCityName(provinceName) : null;
    for (const t of tokens) {
        if (POSTAL_FULL_RE.test(t) || POSTAL_FSA_RE.test(t)) continue;
        if (t.toLowerCase() === 'canada') continue;
        const key = normalizeCityName(t);
        if (provLower && key === provLower) continue;
        const canonical = officialLookup.get(key);
        if (canonical) return canonical;
    }
    return null;
}
