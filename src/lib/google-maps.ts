/**
 * Google Maps link builders.
 *
 * The `/@lat,lon,z/data=...` view form draws no marker at all, so a user who
 * zooms out has nothing to aim at. The `?q=` search form drops a pin that stays
 * visible at every zoom level, which is what every tower view needs.
 */

interface PinnedMapOptions {
    /** Initial zoom, 0-21. Google picks its own default when omitted. */
    zoom?: number;
    /** Show the satellite layer instead of the roadmap. */
    satellite?: boolean;
}

/** One pin on the given coordinates, with an optional zoom and satellite layer. */
export function pinnedMapUrl(lat: number, lon: number, options: PinnedMapOptions = {}): string {
    const params = [`q=${lat},${lon}`];
    if (options.satellite) params.push('t=k');
    if (options.zoom !== undefined) params.push(`z=${options.zoom}`);
    return `https://www.google.com/maps?${params.join('&')}`;
}

/**
 * Two pins in one view: the tower and a place query.
 *
 * A search URL carries a single pin, so the directions form is the only way to
 * keep the tower marked while a nearby business fills the screen. The `data`
 * suffix keeps the satellite layer and driving mode.
 */
export function towerToPlaceUrl(towerLat: number, towerLon: number, placeQuery: string): string {
    const place = encodeURIComponent(placeQuery);
    return `https://www.google.com/maps/dir/${towerLat},${towerLon}/${place}/data=!3m1!1e3!4m2!4m1!3e0`;
}
