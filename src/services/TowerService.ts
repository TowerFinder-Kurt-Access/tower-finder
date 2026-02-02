import { prisma } from '@/lib/prisma';
import { Tower } from '@prisma/client';

export class TowerService {

    /**
     * Finds a tower by ID
     */
    static async getTowerById(id: number) {
        return await prisma.tower.findUnique({
            where: { id },
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
    }

    /**
     * Finds or creates a tower by coordinates
     */
    static async createOrFindTower(lat: number, lon: number, type: string = 'Unknown', status: string = 'New') {
        return await prisma.tower.upsert({
            where: {
                lat_lon: { lat, lon }
            },
            update: {}, // Don't update if exists unless explicit
            create: {
                lat,
                lon,
                type,
                status
            }
        });
    }

    /**
     * Updates tower status or details
     */
    static async updateTower(id: number, data: Partial<Tower>) {
        return await prisma.tower.update({
            where: { id },
            data
        });
    }
}
