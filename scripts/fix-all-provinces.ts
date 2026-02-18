import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Sleep utility to respect Nominatim rate limit (1 request per second)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getProvinceFromLatLon(lat: number, lon: number): Promise<string | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'TowerFinderApp/1.0',
            },
        });

        const address = response.data.address;
        if (!address) return null;

        // Try to find the province/state in the response
        let candidate = address.state || address.region || address.state_district;

        if (!candidate) return null;

        return candidate;
    } catch (error: any) {
        console.error(`Nominatim error for ${lat}, ${lon}:`, error.message);
        return null;
    }
}

async function fixTowerLeads() {
    console.log('--- Fixing Tower Leads ---');

    while (true) {
        // Find leads with missing province
        const leads = await prisma.towerLead.findMany({
            where: {
                OR: [
                    { province: null },
                    { province: '' }
                ]
            },
            take: 10,
        });

        if (leads.length === 0) {
            console.log('No more Tower Leads with missing province found.');
            break;
        }

        for (const lead of leads) {
            console.log(`Processing Tower Lead ${lead.id}...`);
            const province = await getProvinceFromLatLon(lead.lat, lead.lon);

            if (province) {
                await prisma.towerLead.update({
                    where: { id: lead.id },
                    data: { province },
                });
                console.log(`Updated Tower Lead ${lead.id} -> ${province}`);
            } else {
                console.log(`Could not resolve province for Tower Lead ${lead.id}. Skipping...`);
            }
            await sleep(1100);
        }
    }
}

async function fixTowers() {
    console.log('--- Fixing Towers (Parcels) ---');

    while (true) {
        // Find parcels linked to a tower that are missing province OR stateRaw
        const parcels = await prisma.parcel.findMany({
            where: {
                tower: { isNot: null }, // Ensure linked tower exists
                AND: [
                    { OR: [{ provinceRaw: null }, { provinceRaw: '' }] },
                    { OR: [{ stateRaw: null }, { stateRaw: '' }] }
                ]
            },
            include: { tower: true },
            take: 10
        });

        if (parcels.length === 0) {
            console.log('No more Towers/Parcels with missing province found.');
            break;
        }

        for (const parcel of parcels) {
            if (!parcel.tower) continue;

            console.log(`Processing Parcel ${parcel.id} (Tower ${parcel.towerId})...`);
            const province = await getProvinceFromLatLon(parcel.tower.lat, parcel.tower.lon);

            if (province) {
                await prisma.parcel.update({
                    where: { id: parcel.id },
                    data: {
                        provinceRaw: province,
                        stateRaw: province
                    }
                });
                console.log(`Updated Parcel ${parcel.id} -> ${province}`);
            } else {
                console.log(`Could not resolve province for Parcel ${parcel.id}. Skipping...`);
            }
            await sleep(1100);
        }
    }
}

async function main() {
    try {
        await fixTowerLeads();
        await fixTowers();
        console.log('All updates complete.');
    } catch (error) {
        console.error('Script failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
