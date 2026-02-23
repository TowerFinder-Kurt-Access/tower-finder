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
    static async createOrFindTower(lat: number, lon: number, typeName: string = 'Unknown', status: string = 'New') {
        let typeId = undefined;
        if (typeName !== 'Unknown') {
            const existingType = await prisma.towerType.findFirst({ where: { name: typeName } });
            if (existingType) {
                typeId = existingType.id;
            } else {
                const newType = await prisma.towerType.create({ data: { name: typeName } });
                typeId = newType.id;
            }
        }

        let statusId = undefined;
        if (status !== 'Unknown') {
            const existingStatus = await prisma.towerStatus.findFirst({ where: { name: status } });
            if (existingStatus) {
                statusId = existingStatus.id;
            } else {
                const newStatus = await prisma.towerStatus.create({ data: { name: status } });
                statusId = newStatus.id;
            }
        }

        return await prisma.tower.upsert({
            where: {
                lat_lon: { lat, lon }
            },
            update: {},
            create: {
                lat,
                lon,
                typeId,
                statusId,
                legacyStatus: status
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
