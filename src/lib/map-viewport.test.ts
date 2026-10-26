/**
 * Self-check for the coordinate helpers.
 *
 * A `[lat, lon]` to `[lng, lat]` swap still renders, so it fails silently.
 * Run with: npx tsx src/lib/map-viewport.test.ts
 */

import assert from 'node:assert/strict';
import {
    toLngLat,
    toLatLng,
    centerToLatLng,
} from './map-viewport';

const TOWER_LAT = 46.5;
const TOWER_LON = -64.0;

const lngLat = toLngLat(TOWER_LAT, TOWER_LON);
assert.deepEqual(lngLat, [-64.0, 46.5], 'longitude comes first for MapLibre');

assert.deepEqual(toLatLng(lngLat[0], lngLat[1]), [TOWER_LAT, TOWER_LON], 'round trip is lossless');

assert.deepEqual(centerToLatLng(lngLat), [TOWER_LAT, TOWER_LON], 'a viewport center reads back in app order');

// A negative latitude would look plausible if the pair were swapped.
assert.equal(lngLat[1], TOWER_LAT, 'latitude stays in the second slot');

console.log('map-viewport: 4 checks passed');
