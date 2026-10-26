/**
 * Map coordinate helpers.
 *
 * The page and the API use `[lat, lon]` pairs. MapLibre, and therefore mapcn,
 * uses `[longitude, latitude]`. Every value crossing that boundary goes
 * through this file, so a swap cannot silently place a marker in the wrong
 * hemisphere.
 */

/** MapLibre coordinate order. */
export type LngLat = [number, number];

/** `[lat, lon]` order, used by the rest of the app. */
export type LatLng = [number, number];

/** Convert an app `[lat, lon]` pair to a MapLibre `[lng, lat]` pair. */
export function toLngLat(lat: number, lon: number): LngLat {
    return [lon, lat];
}

/** Convert a MapLibre `[lng, lat]` pair back to an app `[lat, lon]` pair. */
export function toLatLng(lng: number, lat: number): LatLng {
    return [lat, lng];
}

/** Read a viewport center back into app order. */
export function centerToLatLng(center: LngLat): LatLng {
    return toLatLng(center[0], center[1]);
}
