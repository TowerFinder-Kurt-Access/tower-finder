const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = 65;

/**
 * ISO 3166-1 alpha-2 code to a flag emoji. Returns an empty string for input
 * that is not two ASCII letters, so callers can fall back to plain text.
 */
export function countryFlag(code: string | null | undefined): string {
    if (!code) return '';
    const value = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) return '';

    return [...value]
        .map((letter) => String.fromCodePoint(REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A))
        .join('');
}

/** Full country name, falling back to the code when the runtime lacks the data. */
export function countryName(code: string | null | undefined): string {
    if (!code) return 'Unknown';
    const value = code.trim().toUpperCase();

    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(value) ?? value;
    } catch {
        return value;
    }
}
