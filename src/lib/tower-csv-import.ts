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
import canadianCities from '@/lib/canadian_cities.json';
import canadianCounties from '@/lib/canadian_counties.json';
import { CANADA_PROVINCES, USA_STATES } from '@/lib/constants';
import { normalizeCityName, normalizeCountyName } from '@/lib/extract-location';
import { parseLeaseExpiryDate } from '@/lib/lease-expiry';

export const MAX_IMPORT_ROWS = 500;

export type ImportCountry = 'USA' | 'Canada';

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
    warnings: string[];
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

/** Template column order, matching the Tower List table left to right. */
export const TEMPLATE_COLUMNS = [
    'Type', 'Lease Expiry', 'Owner Name', 'Contact Person', 'Notes',
    'Address', 'City', 'County', 'State', 'ZIP',
] as const;

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

const citySets = new Map<string, Set<string>>();
const countySets = new Map<string, Set<string>>();

function officialCities(code: string): Set<string> {
    if (!citySets.has(code)) {
        citySets.set(code, new Set(
            ((canadianCities as Record<string, string[]>)[code] ?? []).map(normalizeCityName),
        ));
    }
    return citySets.get(code) as Set<string>;
}

function officialCounties(code: string): Set<string> {
    if (!countySets.has(code)) {
        countySets.set(code, new Set(
            ((canadianCounties as Record<string, string[]>)[code] ?? []).map(normalizeCountyName),
        ));
    }
    return countySets.get(code) as Set<string>;
}

const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
const COUNTY_NAME_RE = /^[A-Za-z][A-Za-z .'\-]{1,59}$/;

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
    const absent: string[] = [];
    if (columns.address === undefined) absent.push('Address');
    if (columns.city === undefined) absent.push('City');
    if (columns.county === undefined) absent.push('County');
    if (columns.state === undefined) absent.push('State');
    if (columns.zip === undefined) absent.push('ZIP');
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
        const warnings: string[] = [];

        const address = cell('address');
        const cityRaw = cell('city');
        const countyRaw = cell('county');
        const stateRaw = cell('state');
        const zipRaw = cell('zip');

        if (!address) rowErrors.push('Address is required');
        if (!cityRaw) rowErrors.push('City is required');
        if (!countyRaw) rowErrors.push('County is required');
        if (!zipRaw) rowErrors.push('ZIP is required');

        // The dialog's country decides the allowed states; a row cannot cross it.
        const province = provinceByKey.get(headerKey(stateRaw))
            ?? (stateRaw.length === 2 ? provinceByCode.get(stateRaw.toUpperCase()) : undefined);
        if (!stateRaw) rowErrors.push('State or Province is required');
        else if (!province) rowErrors.push(`State or Province "${stateRaw}" is not a US state or Canadian province`);
        else if (province.country !== country) rowErrors.push(`${province.name} is in ${province.country}, not ${country}`);

        // ZIP / postal code: format must match the country.
        let zip = '';
        if (zipRaw && country === 'Canada') {
            if (!CA_POSTAL_RE.test(zipRaw)) rowErrors.push(`Postal code "${zipRaw}" is not A1A 1A1`);
            else {
                const compact = zipRaw.toUpperCase().replace(/\s+/g, '');
                zip = `${compact.slice(0, 3)} ${compact.slice(3)}`;
            }
        } else if (zipRaw) {
            if (!US_ZIP_RE.test(zipRaw)) rowErrors.push(`ZIP "${zipRaw}" is not a 5-digit ZIP or ZIP+4`);
            else zip = zipRaw.slice(0, 5);
        }

        // Canada is checked against the official municipality and division lists.
        let city = cityRaw;
        if (cityRaw && country === 'Canada' && province) {
            if (!officialCities(province.code).has(normalizeCityName(cityRaw))) {
                rowErrors.push(`City "${cityRaw}" is not an official ${province.name} municipality`);
            } else city = titleCase(cityRaw);
        } else if (cityRaw) city = titleCase(cityRaw);

        const bareCounty = countyRaw.replace(/\s+(county|parish|borough|census area)$/i, '').trim();
        let county = bareCounty;
        if (bareCounty && country === 'Canada' && province) {
            if (!officialCounties(province.code).has(normalizeCountyName(bareCounty))) {
                rowErrors.push(`County "${countyRaw}" is not an official ${province.name} census division`);
            } else county = bareCounty;
        } else if (bareCounty) {
            if (!COUNTY_NAME_RE.test(bareCounty)) rowErrors.push(`County "${countyRaw}" is not a county name`);
            else county = titleCase(bareCounty);
        }

        // A repeated location in one file would create two towers on one point.
        const fingerprint = `${address}|${city}|${stateRaw}`.toLowerCase();
        if (address && cityRaw && stateRaw) {
            if (seen.has(fingerprint)) rowErrors.push('This address repeats an earlier row');
            seen.add(fingerprint);
        }

        // Lease Expiry is optional; when a date is present it must be a real one.
        const leaseRaw = cell('leaseExpiry');
        if (leaseRaw && !parseLeaseExpiryDate(leaseRaw)) {
            rowErrors.push(`Lease Expiry "${leaseRaw}" is not a date (use YYYY-MM-DD)`);
        }

        if (rowErrors.length > 0) {
            errors.push({ row: rowNumber, message: rowErrors.join('. ') });
            return;
        }
        if (!province) return;

        rows.push({
            row: rowNumber,
            country,
            address,
            city,
            county,
            state: province.name,
            stateCode: province.code,
            zip,
            typeName: cell('type') || null,
            ownerName: cell('ownerName') || null,
            contactPerson: cell('contactPerson') || null,
            notes: cell('notes') || null,
            leaseExpiry: leaseRaw || null,
            warnings,
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
