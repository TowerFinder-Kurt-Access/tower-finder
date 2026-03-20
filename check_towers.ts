
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPendingTowers() {
    try {
        const pendingCount = await prisma.tower.count({
            where: { parcelProcessedAt: null }
        });

        console.log(`Towers waiting for NRCan processing: ${pendingCount}`);

        const totalTowers = await prisma.tower.count();
        const processedWithParcel = await prisma.tower.count({
            where: {
                parcelProcessedAt: { not: null },
                parcel: { isNot: null }
            }
        });
        const processedWithoutParcel = await prisma.tower.count({
            where: {
                parcelProcessedAt: { not: null },
                parcel: { is: null }
            }
        });

        console.log(`Total Towers: ${totalTowers}`);
        console.log(`Processed (Found Parcel): ${processedWithParcel}`);
        console.log(`Processed (No Parcel Found): ${processedWithoutParcel}`);

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkPendingTowers();
