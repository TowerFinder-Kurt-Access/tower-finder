/**
 * Validation helpers backed by the official StatsCan municipality list
 * (canadian_cities.json). Used to keep Canadian filter dropdowns free of the
 * non-municipality junk (postal fragments, street names, regions) that lingers in
 * raw parcel columns.
 */
import canadianCities from '@/lib/canadian_cities.json' with { type: 'json' };

function key(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const officialCitySet = new Set<string>();
for (const names of Object.values(canadianCities as Record<string, string[]>)) {
    for (const name of names) officialCitySet.add(key(name));
}

/** Full Canadian postal code "A1A 1A1" or the 3-char forward sortation area "A1A". */
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]( ?\d[A-Za-z]\d)?$/;

export function isOfficialCanadianCity(name: string): boolean {
    return officialCitySet.has(key(name));
}

/** Keep only values that are real Canadian municipalities. */
export function filterOfficialCanadianCities(names: string[]): string[] {
    return names.filter(isOfficialCanadianCity);
}

/** Keep only values that look like a Canadian postal code / FSA. */
export function filterCanadianPostalCodes(values: string[]): string[] {
    return values.filter(v => POSTAL_RE.test(v.trim()));
}

/** True when the requested country is Canada (dropdowns are only cleaned for Canada). */
export function isCanada(country?: string | null): boolean {
    return !!country && country.trim().toLowerCase() === 'canada';
}
