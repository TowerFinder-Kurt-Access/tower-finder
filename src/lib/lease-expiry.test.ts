/**
 * Self-check for the lease expiry helpers.
 *
 * Guards the "no past dates" rule and the 60-day urgency window: a boundary
 * flip here silently breaks the sidebar badge and the red chips.
 * Run with: npx tsx src/lib/lease-expiry.test.ts
 */

import assert from 'node:assert/strict';
import {
    isLeaseExpiryInPast,
    isLeaseExpiryUrgent,
    formatLeaseExpiry,
    parseLeaseExpiryDate,
    minLeaseExpiryDate,
    toLocalDateString,
    LEASE_URGENT_DAYS,
} from './lease-expiry';

const DAY_MS = 24 * 60 * 60 * 1000;
// Days offset from the LOCAL calendar, the reference the helpers compare in.
const localDay = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return toLocalDateString(date);
};
// Days offset from the UTC calendar, for clientToday semantics (server view).
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

// Past-date rule: today is the earliest allowed date. Without clientToday the
// helper falls back to UTC (the server view), so those cases use UTC days.
assert.equal(isLeaseExpiryInPast(minLeaseExpiryDate(), minLeaseExpiryDate()), false, 'today is allowed');
assert.equal(isLeaseExpiryInPast('2025-01-01'), true, '2025 is rejected');
assert.equal(isLeaseExpiryInPast(isoDay(-1)), true, 'UTC yesterday is rejected without clientToday');
assert.equal(isLeaseExpiryInPast(isoDay(1)), false, 'tomorrow is allowed');
assert.equal(isLeaseExpiryInPast(localDay(-1), localDay(-1)), false, 'local yesterday is accepted as client-today');

// Server-side past-date rule prefers the browser's local date, bounded to one
// day: on a UTC server, a west-of-UTC user's evening "today" is UTC's yesterday.
assert.equal(isLeaseExpiryInPast(isoDay(-1), isoDay(-1)), false, 'client-today one day behind UTC is accepted');
assert.equal(isLeaseExpiryInPast(isoDay(1), isoDay(0)), false, 'client-today one day ahead of UTC is accepted');
assert.equal(isLeaseExpiryInPast(isoDay(-1), isoDay(-2)), true, 'clientToday two days stale falls back and rejects');
assert.equal(isLeaseExpiryInPast('2025-01-01', '2025-01-01'), true, 'clientToday cannot hide a far past date');
assert.equal(isLeaseExpiryInPast(isoDay(-1), 'not-a-date'), true, 'garbage clientToday falls back and rejects');

// Parsing: the API validates untrusted values with parseLeaseExpiryDate.
assert.equal(parseLeaseExpiryDate('not-a-date'), null, 'garbage does not parse');
assert.equal(parseLeaseExpiryDate(''), null, 'empty does not parse');
assert.equal(parseLeaseExpiryDate(42), null, 'non-string does not parse');
assert.ok(parseLeaseExpiryDate('2027-01-15') instanceof Date, 'date-only parses');
assert.ok(parseLeaseExpiryDate(new Date().toISOString()) instanceof Date, 'ISO string parses');

// Urgency window: expired or within LEASE_URGENT_DAYS, inclusive. Boundary
// days are UTC-relative, the reference the stored timestamps serialize to.
assert.equal(LEASE_URGENT_DAYS, 60, 'urgency window stays at 60 days');
assert.equal(isLeaseExpiryUrgent('2020-01-01'), true, 'expired is urgent');
assert.equal(isLeaseExpiryUrgent(isoDay(LEASE_URGENT_DAYS)), true, 'last day of the window is urgent');
assert.equal(isLeaseExpiryUrgent(isoDay(LEASE_URGENT_DAYS + 1)), false, 'day after the window is not urgent');
assert.equal(isLeaseExpiryUrgent(null), false, 'no date is not urgent');
assert.equal(isLeaseExpiryUrgent('garbage'), false, 'invalid date is not urgent');
assert.equal(isLeaseExpiryUrgent(new Date(Date.now() + 30 * DAY_MS)), true, 'thirty days out is urgent');

// Formatting accepts date-only, ISO, and Date; bad input stays empty.
assert.equal(formatLeaseExpiry('2027-01-15'), 'Jan 15, 2027', 'date-only formats');
assert.equal(formatLeaseExpiry('2027-01-15T00:00:00.000Z'), 'Jan 15, 2027', 'ISO formats');
assert.equal(formatLeaseExpiry(null), '', 'null formats to empty');
assert.equal(formatLeaseExpiry('garbage'), '', 'garbage formats to empty');

// Date-only round trip: local anchoring keeps the calendar day stable.
assert.equal(toLocalDateString(parseLeaseExpiryDate('2027-01-15') as Date), '2027-01-15', 'date-only round trip');

console.log('lease-expiry: all checks passed');
