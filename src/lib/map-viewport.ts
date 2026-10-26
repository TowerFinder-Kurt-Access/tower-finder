/**
 * Map coordinate helpers.
 *
 * Leaflet orders coordinates as `[lat, lon]`. MapLibre, and therefore mapcn,
 * orders them as `[longitude, latitude]`. Every value crossing that boundary
 * goes through this file, so a swap cannot silently place a marker in the
 * wrong hemisphere.
 */

/** MapLibre coordinate order. */
export type LngLat = [number, number];

/** Leaflet coordinate order, used by the rest of the app. */
export type LatLng = [number, number];

/** Convert a Leaflet `[lat, lon]` pair to a MapLibre `[lng, lat]` pair. */
export function toLngLat(lat: number, lon: number): LngLat {
    return [lon, lat];
}

/** Convert a MapLibre `[lng, lat]` pair back to a Leaflet `[lat, lon]` pair. */
export function toLatLng(lng: number, lat: number): LatLng {
    return [lat, lng];
}

/** Read a viewport center back into Leaflet order. */
export function centerToLatLng(center: LngLat): LatLng {
    return toLatLng(center[0], center[1]);
}
