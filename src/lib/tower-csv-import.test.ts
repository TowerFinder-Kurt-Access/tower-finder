/**
 * Self-check for the bulk CSV validator.
 *
 * Guards the import contract: the required columns must be present and
 * non-empty, and any value in them is accepted as given. A wrong-region state
 * is still rejected, because that would file the row under the wrong country.
 * Run with: npx tsx src/lib/tower-csv-import.test.ts
 */

import assert from 'node:assert/strict';
import { parseCsv, parseTowerCsv } from './tower-csv-import';
import { REQUIRED_COLUMNS, TEMPLATE_COLUMNS } from './tower-import-fields';

const HEADER = 'Address,City,County,State,ZIP,Type,Owner Name,Contact Person,Notes,Lease Expiry';

function csv(...rows: Partial<Record<
    'address' | 'city' | 'county' | 'state' | 'zip' | 'type' | 'owner' | 'contact' | 'notes' | 'expiry', string
>>[]): string {
    const cells = (values: (string | undefined)[]) => values.map((value) => {
        const text = value ?? '';
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(',');
    return [HEADER, ...rows.map((row) => cells([
        row.address, row.city, row.county, row.state, row.zip,
        row.type, row.owner, row.contact, row.notes, row.expiry,
    ]))].join('\n');
}

// RFC 4180: quoted commas, doubled quotes, CRLF.
assert.deepEqual(parseCsv('a,"b,c","d""e"\r\nf,g,h'), [['a', 'b,c', 'd"e'], ['f', 'g', 'h']]);

// A complete row imports; optional columns are kept.
const full = parseTowerCsv(csv({
    address: '{{ADDRESS_8kmw2v4t}}', city: 'Toronto', county: 'Toronto', state: 'ON', zip: 'M5H 1A1',
    type: 'Monopole', owner: '{{PERSON_q0jsm4zd}}', contact: '{{PERSON_5rnt8cm2}}',
    notes: '1 W Madison St', expiry: '2027-01-15',
}), 'Canada');
assert.equal(full.errors.length, 0, full.errors[0]?.message);
assert.equal(full.rows[0].country, 'Canada');
assert.equal(full.rows[0].zip, 'M5H 1A1');
assert.equal(full.rows[0].county, 'Toronto');
assert.equal(full.rows[0].state, 'Ontario');
assert.equal(full.rows[0].typeName, 'Monopole');
assert.equal(full.rows[0].contactPerson, '{{PERSON_5rnt8cm2}}');
assert.equal(full.rows[0].notes, '1 W Madison St');

// Required means non-empty only: free-form values are accepted and stored.
const loose = parseTowerCsv(csv({
    address: 'Test', city: 'Test Test test', county: 'Test Test test', state: 'Test Test test', zip: 'Test Test test',
}), 'USA');
assert.equal(loose.errors.length, 0, loose.errors[0]?.message);
assert.equal(loose.rows.length, 1);
assert.equal(loose.rows[0].city, 'Test Test test');
assert.equal(loose.rows[0].county, 'Test Test Test');
assert.equal(loose.rows[0].zip, 'Test Test test');
assert.equal(loose.rows[0].state, 'Test Test test', 'an unknown state is kept as written');
assert.equal(loose.rows[0].stateCode, 'TEST TEST TEST');

// A value in the wrong postal shape is kept rather than rejected.
assert.equal(parseTowerCsv(csv({
    address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: 'M5H 1A1',
}), 'USA').errors.length, 0);
// A shape that fits the country is still tidied.
assert.equal(parseTowerCsv(csv({
    address: '1 King St', city: 'Toronto', county: 'Toronto', state: 'ON', zip: 'm5h1a1',
}), 'Canada').rows[0].zip, 'M5H 1A1');
assert.equal(parseTowerCsv(csv({
    address: '{{ADDRESS_b6ovxf0e}}', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606-1234',
}), 'USA').rows[0].zip, '60606');

// Canada stores Title Case, the USA stores lower case for city and county.
assert.equal(parseTowerCsv(csv({
    address: '1 King St', city: 'toronto', county: 'toronto', state: 'on', zip: 'M5H 1A1',
}), 'Canada').rows[0].city, 'Toronto');
assert.equal(parseTowerCsv(csv({
    address: '{{ADDRESS_b6ovxf0e}}', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606',
}), 'USA').rows[0].city, 'Chicago');
assert.equal(parseTowerCsv(csv({
    address: '{{ADDRESS_b6ovxf0e}}', city: 'Chicago', county: 'cook county', state: 'IL', zip: '60606',
}), 'USA').rows[0].county, 'Cook County');

// The chosen region still wins: a US state in a Canada import is rejected.
const wrongRegion = parseTowerCsv(csv({
    address: '233 S Wacker Dr', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606',
}), 'Canada');
assert.equal(wrongRegion.rows.length, 0);
assert.match(wrongRegion.errors[0].message, /Illinois is in USA, not Canada/);

// Every required column, when empty, fails the row and names the column.
for (const missing of [
    { city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606' },
    { address: '1 Main St', county: 'Cook', state: 'IL', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', state: 'IL', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', county: 'Cook', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL' },
]) {
    const result = parseTowerCsv(csv(missing), 'USA');
    assert.equal(result.rows.length, 0, 'a row without a required column imports nothing');
    assert.match(result.errors[0].message, /is required/);
}

// A repeated address in one file is still an error.
const duplicate = parseTowerCsv(csv(
    { address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606' },
), 'USA');
assert.match(duplicate.errors[0].message, /repeats an earlier row/);

// Lease Expiry is optional: a blank cell, or text that is not a date, is skipped.
for (const text of ['', '15/01/2027', 'Test Test test', 'next spring']) {
    const unreadable = parseTowerCsv(csv({
        address: '1 Main St', city: 'Chicago', county: 'Cook',
        state: 'IL', zip: '60606', expiry: text,
    }), 'USA');
    assert.equal(unreadable.errors.length, 0, `"${text}" must not reject the row: ${unreadable.errors[0]?.message}`);
    assert.equal(unreadable.rows[0].leaseExpiry, null);
    assert.equal(unreadable.rows[0].raw['Lease Expiry'], text, 'the raw text is kept for the record');
}
assert.equal(parseTowerCsv(csv({
    address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606', expiry: '2027-06-30',
}), 'USA').rows[0].leaseExpiry, '2027-06-30');

// A file without the required columns fails whole, naming them in list order.
assert.match(
    parseTowerCsv('City,State\nChicago,IL\n', 'USA').errors[0].message,
    /needs these columns: Address, County, ZIP/,
);
assert.match(parseTowerCsv('', 'USA').errors[0].message, /empty/);

// Lat/lon columns are not read: the address is the only location input.
const legacy = parseTowerCsv('Latitude,Longitude,Address,City,County,State,ZIP\n41.8,-87.6,1 Main St,Chicago,Cook,IL,60606\n', 'USA');
assert.equal(legacy.errors.length, 0, legacy.errors[0]?.message);
assert.equal(legacy.rows.length, 1);
assert.equal('lat' in legacy.rows[0], false, 'a pre-geocode row carries no coordinates');

// Regions group the valid rows for the pre-import check.
const regions = parseTowerCsv(csv(
    { address: '1 King St', city: 'Toronto', county: 'Toronto', state: 'ON', zip: 'M5H 1A1' },
    { address: '2 King St', city: 'Toronto', county: 'Toronto', state: 'ON', zip: 'M5H 1A1' },
), 'Canada').regions;
assert.deepEqual(regions, [{ country: 'Canada', province: 'Ontario', count: 2 }]);

// The template header is the bare column names in Tower List order, and a
// header-only file parses to zero rows rather than a fake record.
assert.deepEqual([...TEMPLATE_COLUMNS], [
    'Type', 'Lease Expiry', 'Owner Name', 'Contact Person', 'Notes',
    'Address', 'City', 'County', 'State', 'ZIP',
]);
assert.deepEqual([...REQUIRED_COLUMNS], ['Address', 'City', 'County', 'State', 'ZIP']);
const headerOnly = parseTowerCsv(TEMPLATE_COLUMNS.join(','), 'Canada');
assert.equal(headerOnly.errors.length, 0, headerOnly.errors[0]?.message);
assert.equal(headerOnly.rows.length, 0);
assert.equal(headerOnly.totalRows, 0);

console.log('tower-csv-import: all checks passed');
