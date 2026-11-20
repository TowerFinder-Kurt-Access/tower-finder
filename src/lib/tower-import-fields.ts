/**
 * Tower import field names shared by the API, the dialogs and the service.
 *
 * Kept apart from `tower-csv-import.ts` so a client component can read the
 * column order without pulling the Canadian city and county JSON into the
 * browser bundle.
 */

export type ImportCountry = 'USA' | 'Canada';

/** Template column order, matching the Tower List table left to right. */
export const TEMPLATE_COLUMNS = [
    'Type', 'Lease Expiry', 'Owner Name', 'Contact Person', 'Notes',
    'Address', 'City', 'County', 'State', 'ZIP',
] as const;

/** Columns a row cannot omit. Any non-empty value is accepted. */
export const REQUIRED_COLUMNS = ['Address', 'City', 'County', 'State', 'ZIP'] as const;

/** Columns stored only when the cell has a value. */
export const OPTIONAL_COLUMNS = ['Type', 'Lease Expiry', 'Owner Name', 'Contact Person', 'Notes'] as const;

export const COUNTRY_TABS: { country: ImportCountry; label: string; hint: string }[] = [
    { country: 'USA', label: 'USA', hint: 'State, ZIP, county' },
    { country: 'Canada', label: 'Canada', hint: 'Province, postal code, census division' },
];
