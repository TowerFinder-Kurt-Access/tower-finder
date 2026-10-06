/** Radius tiers offered by the Nearby Businesses filter, in meters. */
const NEARBY_RADII = [100, 200, 300, 500, 750, 1000, 1500, 2000];

export interface RadiusTier {
    radius: number;
    count: number;
}

/** Tiers that add businesses; tiers above the furthest stored row would repeat the same list. */
export function getRadiusTiers(rows: { distance: number }[]): RadiusTier[] {
    const tiers: RadiusTier[] = [];
    for (const radius of NEARBY_RADII) {
        const count = rows.filter((row) => row.distance <= radius).length;
        if (count > 0 && count !== tiers[tiers.length - 1]?.count) tiers.push({ radius, count });
    }
    return tiers;
}
