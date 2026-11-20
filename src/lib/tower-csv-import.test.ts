/**
 * Self-check for the bulk CSV validator.
 *
 * Guards the strict location rules: the chosen country decides the allowed
 * states, Canadian rows must match the official city/county/postal lists, and
 * a wrong region is rejected rather than written to the wrong list.
 * Run with: npx tsx src/lib/tower-csv-import.test.ts
 */

import assert from 'node:assert/strict';
import { parseCsv, parseTowerCsv, TEMPLATE_COLUMNS } from './tower-csv-import';

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

// A Canadian row must fit the official Ontario lists.
const ontario = parseTowerCsv(csv({
    address: '{{ADDRESS_8kmw2v4t}}', city: 'Toronto', county: 'Toronto', state: 'ON', zip: 'M5H 1A1',
    type: 'Monopole', owner: '{{PERSON_q0jsm4zd}}', contact: '{{PERSON_5rnt8cm2}}',
    notes: '1 W Madison St', expiry: '2027-01-15',
}), 'Canada');
assert.equal(ontario.errors.length, 0, ontario.errors[0]?.message);
assert.equal(ontario.rows[0].country, 'Canada');
assert.equal(ontario.rows[0].zip, 'M5H 1A1');
assert.equal(ontario.rows[0].county, 'Toronto');
assert.equal(ontario.rows[0].typeName, 'Monopole');
assert.equal(ontario.rows[0].contactPerson, '{{PERSON_5rnt8cm2}}');
assert.equal(ontario.rows[0].notes, '1 W Madison St');

// Optional columns are absent without breaking the row.
const bare = parseTowerCsv(csv({
    address: '290 Bremner Blvd', city: 'Toronto', county: 'Toronto', state: 'ON', zip: 'M5V 3L9',
}), 'Canada');
assert.equal(bare.errors.length, 0, bare.errors[0]?.message);
assert.equal(bare.rows[0].typeName, null);
assert.equal(bare.rows[0].ownerName, null);

// Province code and full name both resolve.
assert.equal(parseTowerCsv(csv({ address: '1 King St', city: 'Toronto', county: 'Toronto', state: 'Ontario', zip: 'M5H 1A1' }), 'Canada').rows[0].state, 'Ontario');
assert.equal(parseTowerCsv(csv({ address: '1 King St', city: 'Toronto', county: 'Toronto', state: 'on', zip: 'M5H 1A1' }), 'Canada').rows[0].state, 'Ontario');

// The chosen region wins: a US state in a Canada import is rejected.
const wrongRegion = parseTowerCsv(csv({
    address: '233 S Wacker Dr', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606',
}), 'Canada');
assert.equal(wrongRegion.rows.length, 0);
assert.match(wrongRegion.errors[0].message, /Illinois is in USA, not Canada/);

// A Canadian postal code in a USA import is rejected.
const mixed = parseTowerCsv(csv({
    address: '1 King St', city: 'Chicago', county: 'Cook', state: 'IL', zip: 'M5H 1A1',
}), 'USA');
assert.match(mixed.errors[0].message, /is not a 5-digit ZIP/);

// Fake Canadian municipalities and census divisions are rejected.
const fakeCity = parseTowerCsv(csv({
    address: '1 King St', city: 'Not ACity', county: 'Toronto', state: 'ON', zip: 'M5H 1A1',
}), 'Canada');
assert.match(fakeCity.errors[0].message, /Not ACity" is not an official Ontario municipality/);
const fakeCounty = parseTowerCsv(csv({
    address: '1 King St', city: 'Toronto', county: 'Not A County', state: 'ON', zip: 'M5H 1A1',
}), 'Canada');
assert.match(fakeCounty.errors[0].message, /Not A County" is not an official Ontario census division/);

// A census-division status suffix still matches the official list.
assert.equal(parseTowerCsv(csv({
    address: '1 King St', city: 'Toronto', county: 'York Region', state: 'ON', zip: 'M5H 1A1',
}), 'Canada').errors.length, 0);

// A US county loses its "County" suffix and keeps Title Case.
const chicago = parseTowerCsv(csv({
    address: '{{ADDRESS_b6ovxf0e}}', city: 'Chicago', county: 'cook county', state: 'IL', zip: '60606',
}), 'USA');
assert.equal(chicago.errors.length, 0, chicago.errors[0]?.message);
assert.equal(chicago.rows[0].county, 'Cook');
assert.equal(chicago.rows[0].zip, '60606');

// Required location columns are enforced.
for (const missing of [
    { city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606' },
    { address: '1 Main St', county: 'Cook', state: 'IL', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', state: 'IL', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', county: 'Cook', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL' },
]) {
    const result = parseTowerCsv(csv(missing), 'USA');
    assert.equal(result.rows.length, 0, 'a row without a required column imports nothing');
    assert.ok(result.errors.length > 0);
}

// Unknown states, duplicate addresses and bad dates are errors.
assert.match(parseTowerCsv(csv({ address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'XX', zip: '60606' }), 'USA').errors[0].message, /is not a US state or Canadian province/);
const duplicate = parseTowerCsv(csv(
    { address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606' },
    { address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606' },
), 'USA');
assert.match(duplicate.errors[0].message, /repeats an earlier row/);
assert.match(parseTowerCsv(csv({ address: '1 Main St', city: 'Chicago', county: 'Cook', state: 'IL', zip: '60606', expiry: '15/01/2027' }), 'USA').errors[0].message, /Lease Expiry/);

// A file without the required columns fails whole.
assert.match(
    parseTowerCsv('City,State\nChicago,IL\n', 'USA').errors[0].message,
    /needs these columns: Address, County, ZIP/,
);
assert.match(parseTowerCsv('', 'USA').errors[0].message, /empty/);

// Lat/lon columns are not read: the address is the only location input.
const legacy = parseTowerCsv('Latitude,Longitude,Address,City,County,State,ZIP\n41.8,-87.6,1 Main St,Chicago,Cook,IL,60606\n', 'USA');
assert.equal(legacy.errors.length, 0, legacy.errors[0]?.message);
assert.equal(legacy.rows.length, 1);
assert.equal(legacy.rows[0].address, '1 Main St');
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
const headerOnly = parseTowerCsv(TEMPLATE_COLUMNS.join(','), 'Canada');
assert.equal(headerOnly.errors.length, 0, headerOnly.errors[0]?.message);
assert.equal(headerOnly.rows.length, 0);
assert.equal(headerOnly.totalRows, 0);

// Required columns are named in list order, not template order.
assert.match(
    parseTowerCsv('Notes,Type\nhello,Monopole\n', 'USA').errors[0].message,
    /needs these columns: Address, City, County, State, ZIP/,
);

console.log('tower-csv-import: all checks passed');
