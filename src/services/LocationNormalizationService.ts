import { prisma } from '../lib/prisma.ts';
import { STATE_CODE_TO_NAME, USA_STATES, CANADA_PROVINCES } from '../lib/constants.ts';

export interface NormalizedLocation {
    city?: string;
    province?: string; // Standardized as name
    provinceCode?: string; // Standardized as code (AL, ON, etc.)
    county?: string;
    country?: string;
}

export class LocationNormalizationService {
    private static USER_AGENT = 'TowerFinderNormalization/1.0 (alex@example.com)';
    private static NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

    /**
     * Normalizes a location using local logic and constants.
     */
    static normalizeLocally(city?: string, state?: string, country?: string): NormalizedLocation | null {
        if (!city && !state) return null;

        const normalized: NormalizedLocation = {
            city: city?.trim(),
            country: country?.trim()
        };

        if (state) {
            const trimmedState = state.trim();
            // Check if it's a code
            if (trimmedState.length === 2) {
                normalized.provinceCode = trimmedState.toUpperCase();
                normalized.province = STATE_CODE_TO_NAME[normalized.provinceCode] || trimmedState;
            } else {
                // Check if it's a name and we have a code for it
                normalized.province = trimmedState;
                const entries = [...Object.entries(USA_STATES), ...Object.entries(CANADA_PROVINCES)];
                const found = entries.find(([name]) => name.toLowerCase() === trimmedState.toLowerCase());
                if (found) {
                    normalized.province = found[0];
                    normalized.provinceCode = found[1];
                }
            }
        }

        return normalized;
    }

    /**
     * Normalizes a location using Nominatim.
     * Prioritizes free OpenStreetMap data.
     */
    static async fetchNormalizedData(city?: string, state?: string, country?: string): Promise<NormalizedLocation | null> {
        if (!city && !state) return null;

        const query = [city, state, country].filter(Boolean).join(', ');
        const url = `${this.NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1`;

        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': this.USER_AGENT }
            });

            if (!response.ok) {
                console.error('Nominatim API error:', await response.text());
                return null;
            }

            const data = await response.json();
            if (!data || data.length === 0) return null;

            const address = data[0].address;
            
            // Extract normalized fields
            const normalized: NormalizedLocation = {
                city: address.city || address.town || address.village || address.suburb || address.hamlet,
                province: address.state,
                county: address.county,
                country: address.country
            };

            // Handle state codes
            if (address['ISO3166-2-lvl4']) {
                normalized.provinceCode = address['ISO3166-2-lvl4'].split('-')[1];
            } else if (normalized.province && normalized.province.length === 2) {
                normalized.provinceCode = normalized.province.toUpperCase();
                normalized.province = STATE_CODE_TO_NAME[normalized.provinceCode] || normalized.province;
            }

            return normalized;
        } catch (error) {
            console.error('Location normalization fetch failed:', error);
            return null;
        }
    }

    /**
     * Normalizes a location using local logic first, then Nominatim as fallback.
     */
    static async getNormalizedData(city?: string, state?: string, country?: string): Promise<NormalizedLocation | null> {
        const local = this.normalizeLocally(city, state, country);
        
        // If local normalization is sufficient (has province and city), return it
        if (local && local.province && local.provinceCode && local.city) {
            return local;
        }

        // Otherwise try Nominatim
        const remote = await this.fetchNormalizedData(city, state, country);
        return remote || local;
    }

    /**
     * Upserts City, Province, and County and links them to a Parcel.
     */
    static async normalizeParcel(parcelId: number) {
        const parcel = await prisma.parcel.findUnique({
            where: { id: parcelId }
        });

        if (!parcel) return;

        // Try to normalize using existing raw strings
        const cityStr = parcel.cityRaw;
        const stateStr = parcel.provinceRaw || parcel.stateRaw;
        const countryStr = parcel.country;

        const normalized = await this.getNormalizedData(cityStr || undefined, stateStr || undefined, countryStr || undefined);

        if (!normalized) return;

        // 1. Upsert Province
        let provinceId: number | undefined;
        if (normalized.province && normalized.provinceCode) {
            const province = await prisma.province.upsert({
                where: { code: normalized.provinceCode },
                update: { name: normalized.province },
                create: { code: normalized.provinceCode, name: normalized.province }
            });
            provinceId = province.id;
        }

        // 2. Upsert County
        let countyId: number | undefined;
        if (normalized.county && provinceId) {
            const county = await prisma.county.upsert({
                where: {
                    name_provinceId: {
                        name: normalized.county,
                        provinceId: provinceId
                    }
                },
                update: {},
                create: {
                    name: normalized.county,
                    provinceId: provinceId
                }
            });
            countyId = county.id;
        }

        // 3. Upsert City
        let cityId: number | undefined;
        if (normalized.city && provinceId) {
            const city = await prisma.city.upsert({
                where: {
                    name_provinceId: {
                        name: normalized.city,
                        provinceId: provinceId
                    }
                },
                update: {},
                create: {
                    name: normalized.city,
                    provinceId: provinceId
                }
            });
            cityId = city.id;
        }

        // Update Parcel with normalized IDs
        await prisma.parcel.update({
            where: { id: parcelId },
            data: {
                cityId: cityId || null,
                provinceId: provinceId || null,
                countyId: countyId || null
            }
        });

        return normalized;
    }
}
