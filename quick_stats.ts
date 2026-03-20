
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickStats() {
    try {
        console.log('Fetching dataSource stats...');

        // This is a much smaller query
        const allParcelSources = await prisma.parcel.findMany({
            select: { id: true, dataSource: true, geometry: true }
        });

        const stats: Record<string, { total: number, noGeo: number }> = {};

        allParcelSources.forEach(p => {
            const src = p.dataSource || 'Unknown';
            if (!stats[src]) stats[src] = { total: 0, noGeo: 0 };
            stats[src].total++;
            if (!p.geometry) stats[src].noGeo++;
        });

        console.table(Object.entries(stats).map(([Source, s]) => ({
            Source,
            Total: s.total,
            'No Geometry': s.noGeo,
            'Percentage': ((s.noGeo / s.total) * 100).toFixed(1) + '%'
        })));

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

quickStats();
