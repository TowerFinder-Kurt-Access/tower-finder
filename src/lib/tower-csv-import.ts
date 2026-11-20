/**
 * Bulk tower CSV validation.
 *
 * The file carries the Tower list columns, not coordinates: each row is an
 * address, and the importer geocodes it to a point. A row is accepted only when
 * its state/province, city, county and ZIP/postal code fit the same lists the
 * list filters use, inside the country the user picked in the dialog.
 *
 * Pure module: no Prisma and no network, so the API and the tests share it.
 */
import { CANADA_PROVINCES, USA_STATES } from '@/lib/constants';
import { REQUIRED_COLUMNS } from '@/lib/tower-import-fields';
import { parseLeaseExpiryDate } from '@/lib/lease-expiry';
import type { ImportCountry } from '@/lib/tower-import-fields';

export type { ImportCountry };

export const MAX_IMPORT_ROWS = 500;

export interface CsvRow {
    row: number;
    country: ImportCountry;
    address: string;
    city: string;
    county: string;
    state: string;
    stateCode: string;
    zip: string;
    typeName: string | null;
    ownerName: string | null;
    contactPerson: string | null;
    notes: string | null;
    leaseExpiry: string | null;
    raw: Record<string, string>;
}

export interface CsvRowError {
    row: number;
    message: string;
}

export interface CsvParseResult {
    totalRows: number;
    rows: CsvRow[];
    errors: CsvRowError[];
    /** Valid rows grouped by state/province, for the pre-import confirmation. */
    regions: { country: string; province: string; count: number }[];
}

/** RFC 4180 reader: quotes, doubled quotes, CRLF, and a trailing newline. */
export function parseCsv(text: string): string[][] {
    const records: string[][] = [];
    let record: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 1; }
                else quoted = false;
            } else field += char;
            continue;
        }
        if (char === '"') quoted = true;
        else if (char === ',') { record.push(field); field = ''; }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i += 1;
            record.push(field);
            field = '';
            if (record.some((value) => value.trim() !== '')) records.push(record);
            record = [];
        } else field += char;
    }
    record.push(field);
    if (record.some((value) => value.trim() !== '')) records.push(record);
    return records;
}

type ColumnKey =
    | 'address' | 'city' | 'county' | 'state' | 'zip' | 'type'
    | 'ownerName' | 'contactPerson' | 'notes' | 'leaseExpiry';

const HEADER_ALIASES: Record<string, ColumnKey> = {
    address: 'address', streetaddress: 'address', sitestreet: 'address', location: 'address',
    city: 'city', town: 'city', municipality: 'city',
    county: 'county', countyname: 'county',
    state: 'state', province: 'state', statename: 'state', provincename: 'state',
    zip: 'zip', zipcode: 'zip', postalcode: 'zip', postcode: 'zip', postal: 'zip',
    type: 'type', towertype: 'type', structuretype: 'type',
    owner: 'ownerName', ownername: 'ownerName', propertyowner: 'ownerName',
    contact: 'contactPerson', contactperson: 'contactPerson', contactname: 'contactPerson',
    notes: 'notes', note: 'notes', remarks: 'notes', comments: 'notes',
    leaseexpiry: 'leaseExpiry', leaseexpiration: 'leaseExpiry', leaseend: 'leaseExpiry',
};

type Columns = Partial<Record<ColumnKey, number>>;

/** Header text as a stable key: lower case, letters and digits only. */
function headerKey(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const provinceByCode = new Map<string, { name: string; code: string; country: ImportCountry }>();
const provinceByKey = new Map<string, { name: string; code: string; country: ImportCountry }>();
for (const [country, list] of [['Canada', CANADA_PROVINCES], ['USA', USA_STATES]] as const) {
    for (const [name, code] of Object.entries(list)) {
        const entry = { name, code, country };
        provinceByCode.set(code, entry);
        provinceByKey.set(headerKey(name), entry);
    }
}

// Postal patterns only tidy a value that already fits; nothing is rejected.
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

/** Canada rows keep Title Case; US rows store lower case, as the list does. */
function titleCase(value: string): string {
    return value
        .toLowerCase()
        .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
        .replace(/\bmc([a-z])/g, (_match, letter: string) => `Mc${letter.toUpperCase()}`);
}

/** The geocoder query for one row. */
export function addressQuery(row: Pick<CsvRow, 'address' | 'city' | 'county' | 'state' | 'zip' | 'country'>): string {
    const parts = [row.address, row.city, row.county, `${row.state} ${row.zip}`];
    if (row.country === 'Canada') parts.push('Canada');
    else parts.push('USA');
    return parts.filter(Boolean).join(', ');
}

/**
 * Validate every CSV row against the Tower list column rules for one country.
 *
 * Address, City, County, State and ZIP are required. Type, Owner Name, Contact
 * Person, Notes and Lease Expiry are optional but kept when present.
 */
export function parseTowerCsv(text: string, country: ImportCountry): CsvParseResult {
    const records = parseCsv(text.replace(/^\uFEFF/, ''));
    if (records.length === 0) {
        return { totalRows: 0, rows: [], errors: [{ row: 0, message: 'The file is empty' }], regions: [] };
    }

    const headers = records[0].map((header) => header.trim());
    const columns: Columns = {};
    for (const [index, header] of headers.entries()) {
        const key = HEADER_ALIASES[headerKey(header)];
        if (key && columns[key] === undefined) columns[key] = index;
    }
    // Required columns are named in list order, independent of the template order.
    const absent = REQUIRED_COLUMNS.filter((column) => columns[HEADER_ALIASES[headerKey(column)]] === undefined);
    if (absent.length > 0) {
        return {
            totalRows: 0, rows: [], regions: [],
            errors: [{ row: 1, message: `The header row needs these columns: ${absent.join(', ')}` }],
        };
    }

    const body = records.slice(1);
    if (body.length > MAX_IMPORT_ROWS) {
        return {
            totalRows: body.length, rows: [], regions: [],
            errors: [{ row: 0, message: `The file has ${body.length} rows. The limit is ${MAX_IMPORT_ROWS} rows per import` }],
        };
    }

    const rows: CsvRow[] = [];
    const errors: CsvRowError[] = [];
    const seen = new Set<string>();

    body.forEach((values, index) => {
        const rowNumber = index + 2;
        const cell = (column: ColumnKey): string => {
            const position = columns[column];
            return position === undefined ? '' : (values[position] ?? '').trim();
        };
        const rowErrors: string[] = [];

        const address = cell('address');
        const cityRaw = cell('city');
        const countyRaw = cell('county');
        const stateRaw = cell('state');
        const zipRaw = cell('zip');

        // Required means non-empty. The value itself is not second-guessed:
        // county, city and ZIP are stored as the file gives them.
        if (!address) rowErrors.push('Address is required');
        if (!cityRaw) rowErrors.push('City is required');
        if (!countyRaw) rowErrors.push('County is required');
        if (!stateRaw) rowErrors.push('State or Province is required');
        if (!zipRaw) rowErrors.push('ZIP is required');

        // A state code or name resolves to its province row when known; an
        // unrecognised value is still kept, and the row still imports.
        const province = provinceByKey.get(headerKey(stateRaw))
            ?? (stateRaw.length === 2 ? provinceByCode.get(stateRaw.toUpperCase()) : undefined);
        if (province && province.country !== country) {
            rowErrors.push(`${province.name} is in ${province.country}, not ${country}`);
        }

        // The country's postal form is normalised when it fits, otherwise kept.
        const zip = country === 'Canada' && CA_POSTAL_RE.test(zipRaw)
            ? `${zipRaw.toUpperCase().replace(/\s+/g, '').slice(0, 3)} ${zipRaw.toUpperCase().replace(/\s+/g, '').slice(3)}`
            : country === 'USA' && US_ZIP_RE.test(zipRaw)
                ? zipRaw.slice(0, 5)
                : zipRaw;

        const city = country === 'Canada' ? titleCase(cityRaw) : cityRaw;
        const county = country === 'Canada' ? countyRaw : titleCase(countyRaw);

        // A repeated location in one file would create two towers on one point.
        const fingerprint = `${address}|${city}|${stateRaw}`.toLowerCase();
        if (address && cityRaw && stateRaw) {
            if (seen.has(fingerprint)) rowErrors.push('This address repeats an earlier row');
            seen.add(fingerprint);
        }

        // Lease Expiry is optional. A blank cell, or text the parser cannot read
        // as a date, is skipped: the row still imports with no expiry. The raw
        // text survives in rawImportData, so nothing is lost.
        const leaseDate = parseLeaseExpiryDate(cell('leaseExpiry'));

        if (rowErrors.length > 0) {
            errors.push({ row: rowNumber, message: rowErrors.join('. ') });
            return;
        }

        rows.push({
            row: rowNumber,
            country,
            address,
            city,
            county,
            state: province?.name ?? stateRaw,
            stateCode: province?.code ?? stateRaw.toUpperCase(),
            zip,
            typeName: cell('type') || null,
            ownerName: cell('ownerName') || null,
            contactPerson: cell('contactPerson') || null,
            notes: cell('notes') || null,
            leaseExpiry: leaseDate ? cell('leaseExpiry') : null,
            raw: Object.fromEntries(headers.map((header, position) => [header, values[position] ?? ''])),
        });
    });

    const regionCounts = new Map<string, { country: string; province: string; count: number }>();
    for (const row of rows) {
        const key = `${row.country}|${row.state}`;
        const entry = regionCounts.get(key);
        if (entry) entry.count += 1;
        else regionCounts.set(key, { country: row.country, province: row.state, count: 1 });
    }
    const regions = Array.from(regionCounts.values())
        .sort((a, b) => a.province.localeCompare(b.province));

    return { totalRows: body.length, rows, errors, regions };
}
