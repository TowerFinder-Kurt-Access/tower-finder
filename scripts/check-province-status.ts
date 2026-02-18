import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStatus() {
    try {
        const leadsMissing = await prisma.towerLead.count({
            where: {
                OR: [
                    { province: null },
                    { province: '' }
                ]
            }
        });

        const parcelsMissing = await prisma.parcel.count({
            where: {
                AND: [
                    { towerId: { not: undefined } },
                    {
                        OR: [
                            { provinceRaw: null },
                            { provinceRaw: '' }
                        ]
                    },
                    {
                        OR: [
                            { stateRaw: null },
                            { stateRaw: '' }
                        ]
                    }
                ]
            }
        });

        console.log(`Tower Leads missing province: ${leadsMissing}`);
        console.log(`Parcels (Towers) missing province: ${parcelsMissing}`);

    } catch (error) {
        console.error('Error checking status:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkStatus();
