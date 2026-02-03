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
        // 1. Check DB for existing Tower at these coordinates
        // We use a small epsilon for float comparison if needed, but strict for now as per plan
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

        // If we have a tower and it has parcel data, return it
        if (existingTower && existingTower.parcel) {
            console.log(`[InformationService] Cache Hit for ${lat}, ${lon}`);
            return existingTower.parcel;
        }

        // 2. Data missing, fetch from External API (ReportAll)
        console.log(`[InformationService] Cache Miss for ${lat}, ${lon} - Fetching external API`);
        const externalData = await this.fetchExternalParcelData(lat, lon);

        if (!externalData) {
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
            const response = await axios.get('https://reportallusa.com/api/parcels', {
                params: {
                    client: CLIENT_KEY,
                    v: 9,
                    spatial_nearest: pointWKT,
                    sn_srid: 4326,
                    limit: 1
                },
                timeout: 60000 // 60s timeout
            });

            if (response.data.results && response.data.results.length > 0) {
                return response.data.results[0];
            }
            return null;

        } catch (error) {
            console.error('[InformationService] External API Error:', error);
            throw error;
        }
    }
}
