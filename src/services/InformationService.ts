import { prisma } from '@/lib/prisma';
import axios from 'axios';

// types for external API response (ReportAll)
interface ReportAllResponse {
    results: any[];
}

export class InformationService {

    /**
     * lat/lon: The coordinates of the TOWER/Location we are researching.
     * This method attempts to find a matching Tower in our DB with owner info.
     * If not found, it calls the external API, creates the Tower+Parcel+Owner in DB, and returns it.
     */
    static async getParcelAndOwner(lat: number, lon: number) {
        console.log(`\n[InformationService] Looking up parcel/owner for coordinates: ${lat}, ${lon}`);

        // Check if caching is enabled (default: disabled)
        const cacheEnabled = process.env.ENABLE_PARCEL_CACHE === 'true';
        console.log(`[InformationService] Cache enabled:`, cacheEnabled);

        // 1. Check DB for existing Tower at these coordinates (only if cache is enabled)
        if (cacheEnabled) {
            const existingTower = await prisma.tower.findUnique({
                where: {
                    lat_lon: { lat, lon }
                },
                include: {
                    parcel: {
                        include: {
                            owner: {
                                include: {
                                    contacts: true
                                }
                            }
                        }
                    }
                }
            });

            console.log(`[InformationService] Tower found in DB:`, existingTower ? 'YES' : 'NO');
            if (existingTower) {
                console.log(`[InformationService] Tower ID:`, existingTower.id);
                console.log(`[InformationService] Has Parcel data:`, existingTower.parcel ? 'YES' : 'NO');
            }

            // If we have a tower and it has parcel data, return it
            if (existingTower && existingTower.parcel) {
                console.log(`[InformationService] ✅ CACHE HIT - Returning cached parcel data`);
                console.log(`[InformationService] Parcel ID:`, existingTower.parcel.parcelId);
                console.log(`[InformationService] Owner:`, existingTower.parcel.owner?.name);
                console.log(`[InformationService] Data Source:`, (existingTower.parcel as any).dataSource);
                return existingTower.parcel;
            }
        } else {
            console.log(`[InformationService] Cache disabled - skipping cache check`);
        }

        // 2. Data missing or cache disabled, fetch from External API (ReportAll)
        console.log(`[InformationService] ❌ CACHE MISS - Fetching from external API`);
        const externalData = await this.fetchExternalParcelData(lat, lon);

        if (!externalData) {
            console.log(`[InformationService] No data returned from external API`);
            return null;
        }

        // 3. Persist to DB
        // We need to upsert the Tower first (or find it if we just didn't have parcel info)
        // Then create the Parcel and Owner

        // Map external data to our schema
        const parcelId = externalData.parcel_id || 'UNKNOWN';
        const address = externalData.address || '';
        const city = externalData.city || '';
        const state = externalData.state || '';
        const zip = externalData.zip;
        const ownerName = externalData.owner || 'UNKNOWN';
        const ownerAddress = externalData.mail_address || '';


        // Extract geometry - ReportAll API returns it as WKT in 'geom_as_wkt' field
        let geometry = null;
        if (externalData.geom_as_wkt) {
            console.log(`[InformationService] Found WKT geometry, converting to GeoJSON...`);
            geometry = this.wktToGeoJSON(externalData.geom_as_wkt);
            console.log(`[InformationService] Geometry converted:`, geometry ? 'YES' : 'NO');
            if (geometry) {
                console.log(`[InformationService] Geometry type:`, geometry.type);
            }
        } else {
            console.log(`[InformationService] No geometry data in response (geom_as_wkt field not found)`);
        }

        // Transaction to ensure consistency
        const result = await prisma.$transaction(async (tx) => {
            // Ensure Tower exists
            const tower = await tx.tower.upsert({
                where: { lat_lon: { lat, lon } },
                create: { lat, lon, status: 'Researched', type: 'Unknown' },
                update: {} // No update needed if exists
            });

            // Create/Connect Owner
            // Simplification: We create a new owner for this parcel. 
            // In a real app we might try to deduplicate owners by name/address.
            const owner = await tx.owner.create({
                data: {
                    name: ownerName,
                    address: ownerAddress,
                    type: 'Unspecified' // API might not give this
                }
            });

            // Upsert Parcel linked to Tower and Owner (in case it exists from Excel import)
            const parcel = await tx.parcel.upsert({
                where: {
                    towerId: tower.id
                },
                create: {
                    parcelId: parcelId,
                    address: address,
                    city: city,
                    state: state,
                    zip: zip,
                    rawData: externalData, // Store complete API response for debugging
                    dataSource: 'ReportAll', // Track which API provided this data
                    geometry: geometry, // Store parcel boundary
                    towerId: tower.id,
                    ownerId: owner.id
                },
                update: {
                    parcelId: parcelId,
                    address: address,
                    city: city,
                    state: state,
                    zip: zip,
                    rawData: externalData,
                    dataSource: 'ReportAll',
                    geometry: geometry, // Update parcel boundary
                    ownerId: owner.id
                },
                include: {
                    owner: {
                        include: {
                            contacts: true
                        }
                    }
                }
            });

            return parcel;
        }, {
            maxWait: 10000, // Wait up to 10s for a connection
            timeout: 20000  // Allow up to 20s for the transaction
        });

        return result;
    }

    private static async fetchExternalParcelData(lat: number, lon: number) {
        const CLIENT_KEY = process.env.REPORTALL_API_KEY;
        if (!CLIENT_KEY) {
            throw new Error('REPORTALL_API_KEY not configured');
        }

        try {
            const pointWKT = `POINT(${lon} ${lat})`;
            const queryParams = {
                client: CLIENT_KEY,
                v: 9,
                spatial_nearest: pointWKT,
                sn_srid: 4326,
                limit: 1
            };

            console.log('\n========== REPORTALL API REQUEST ==========');
            console.log('Timestamp:', new Date().toISOString());
            console.log('Coordinates:', { lat, lon });
            console.log('Query Params:', {
                ...queryParams,
                client: `${CLIENT_KEY.substring(0, 8)}...` // Mask API key
            });
            console.log('Full URL:', `https://reportallusa.com/api/parcels?${new URLSearchParams(queryParams as any).toString().replace(CLIENT_KEY, `${CLIENT_KEY.substring(0, 8)}...`)}`);

            const response = await axios.get('https://reportallusa.com/api/parcels', {
                params: queryParams,
                timeout: 60000 // 60s timeout
            });

            console.log('\n========== REPORTALL API RESPONSE ==========');
            console.log('Status:', response.status);
            console.log('Results Count:', response.data.results?.length || 0);
            console.log('Response Data:', JSON.stringify(response.data, null, 2));
            console.log('==========================================\n');

            if (response.data.results && response.data.results.length > 0) {
                return response.data.results[0];
            }
            return null;

        } catch (error) {
            console.error('\n========== REPORTALL API ERROR ==========');
            console.error('Timestamp:', new Date().toISOString());
            console.error('Coordinates:', { lat, lon });
            console.error('Error:', error);
            if (axios.isAxiosError(error)) {
                console.error('Response Status:', error.response?.status);
                console.error('Response Data:', error.response?.data);
            }
            console.error('==========================================\n');
            throw error;
        }
    }

    /**
     * Convert WKT (Well-Known Text) geometry to GeoJSON format
     * Handles POLYGON and MULTIPOLYGON types
     */
    private static wktToGeoJSON(wkt: string): any {
        try {
            // Remove whitespace and get geometry type
            const trimmed = wkt.trim();

            if (trimmed.startsWith('MULTIPOLYGON')) {
                // Extract coordinates from MULTIPOLYGON(((...)))
                const coordsStr = trimmed.replace(/^MULTIPOLYGON\s*\(\(\(/i, '').replace(/\)\)\)$/, '');
                const polygons = coordsStr.split(')),((');

                const coordinates = polygons.map(polygon => {
                    const rings = polygon.split('),(');
                    return rings.map(ring => {
                        return ring.split(',').map(point => {
                            const [lon, lat] = point.trim().split(/\s+/).map(Number);
                            return [lon, lat];
                        });
                    });
                });

                return {
                    type: 'MultiPolygon',
                    coordinates
                };
            } else if (trimmed.startsWith('POLYGON')) {
                // Extract coordinates from POLYGON((...)
                const coordsStr = trimmed.replace(/^POLYGON\s*\(\(/i, '').replace(/\)\)$/, '');
                const rings = coordsStr.split('),(');

                const coordinates = rings.map(ring => {
                    return ring.split(',').map(point => {
                        const [lon, lat] = point.trim().split(/\s+/).map(Number);
                        return [lon, lat];
                    });
                });

                return {
                    type: 'Polygon',
                    coordinates
                };
            }

            console.warn('[InformationService] Unsupported WKT geometry type:', trimmed.substring(0, 50));
            return null;
        } catch (error) {
            console.error('[InformationService] Error parsing WKT:', error);
            return null;
        }
    }
}
