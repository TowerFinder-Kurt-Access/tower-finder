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
        const zip = externalData.zip
        const ownerName = externalData.owner || 'UNKNOWN';
        const ownerAddress = externalData.mail_address || '';

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

            // Create Parcel linked to Tower and Owner
            const parcel = await tx.parcel.create({
                data: {
                    parcelId: parcelId,
                    address: address,
                    city: city,
                    state: state,
                    zip: zip,
                    rawData: externalData, // Store complete API response for debugging
                    dataSource: 'ReportAll', // Track which API provided this data
                    towerId: tower.id,
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
}
