import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// import { requireAdmin } from '@/lib/auth-helpers';

/** County Centroids for California (Partial for common counties to save space) */
const CA_COUNTY_CENTROIDS: Record<string, [number, number]> = {
    'Alameda': [37.6462, -121.8857],
    'Alpine': [38.5968, -119.8206],
    'Amador': [38.4458, -120.6511],
    'Butte': [39.6642, -121.6030],
    'Calaveras': [38.2046, -120.5541],
    'Colusa': [39.1788, -122.2339],
    'Contra Costa': [37.9192, -121.9280],
    'Del Norte': [41.7422, -123.8972],
    'El Dorado': [38.7426, -120.4358],
    'Fresno': [36.7573, -119.6466],
    'Glenn': [39.5987, -122.3930],
    'Humboldt': [40.6992, -123.8760],
    'Imperial': [33.0395, -115.3654],
    'Inyo': [36.5111, -117.4110],
    'Kern': [35.3433, -118.7277],
    'Kings': [36.0753, -119.8155],
    'Lake': [39.0996, -122.7532],
    'Lassen': [40.6739, -120.5943],
    'Los Angeles': [34.3082, -118.2269],
    'Madera': [37.2153, -119.7665],
    'Marin': [38.0712, -122.7210],
    'Mariposa': [37.5815, -119.9054],
    'Mendocino': [39.4402, -123.3911],
    'Merced': [37.1919, -120.7177],
    'Modoc': [41.5898, -120.7244],
    'Mono': [37.9389, -118.8868],
    'Monterey': [36.2185, -121.2458],
    'Napa': [38.5041, -122.3298],
    'Nevada': [39.3014, -120.7685],
    'Orange': [33.7014, -117.7675],
    'Placer': [39.0610, -120.7240],
    'Plumas': [40.0035, -120.8394],
    'Riverside': [33.7306, -115.9821],
    'Sacramento': [38.4510, -121.3400],
    'San Benito': [36.6031, -121.0699],
    'San Bernardino': [34.8406, -116.1490],
    'San Diego': [33.0341, -116.7353],
    'San Francisco': [37.7749, -122.4194],
    'San Joaquin': [37.9343, -121.2730],
    'San Luis Obispo': [35.3882, -120.4579],
    'San Mateo': [37.4367, -122.3522],
    'Santa Barbara': [34.6532, -120.0188],
    'Santa Clara': [37.2310, -121.6930],
    'Santa Cruz': [37.0239, -122.0016],
    'Shasta': [40.7639, -122.0405],
    'Sierra': [39.5771, -120.5206],
    'Siskiyou': [41.5919, -122.5401],
    'Solano': [38.2682, -121.9443],
    'Sonoma': [38.5283, -122.8874],
    'Stanislaus': [37.5586, -120.9970],
    'Sutter': [39.0335, -121.6948],
    'Tehama': [40.1255, -122.2370],
    'Trinity': [40.6478, -123.1141],
    'Tulare': [36.2201, -118.8005],
    'Tuolumne': [38.0264, -119.9548],
    'Ventura': [34.4446, -119.0910],
    'Yolo': [38.6827, -121.9018],
    'Yuba': [39.2690, -121.3512]
};

export async function GET(req: Request) {
    // await requireAdmin();

    const { searchParams } = new URL(req.url);
    const includeMap = searchParams.get('includeMap') === 'true';
    const scanState = searchParams.get('state');

    const scans = await prisma.discoveryScan.findMany({
        where: scanState ? { state: scanState } : {},
        orderBy: { createdAt: 'desc' },
    });

    const enrichedScans = scans.map((scan) => {
        const total = (scan as any).totalCounties || 0;
        const completed = (scan as any).completedCounties || 0;
        const failed = (scan as any).failedCounties || 0;
        
        const pct = total > 0 ? (completed / total) * 100 : 0;

        return {
            ...scan,
            progressPercent: Math.round(pct * 10),
            totalCells: total, // Map to cells to avoid breaking FE interface
            completedCells: completed,
            failedCells: failed,
        };
    });

    let mapData: any[] = [];
    if (includeMap && scanState) {
        const jobs = await prisma.jobQueue.findMany({
            where: {
                jobType: 'fcc-discovery-county',
                params: { path: ['state'], equals: scanState }
            }
        });

        mapData = jobs.map((job: any) => {
            const county = job.params.county;
            const centroid = CA_COUNTY_CENTROIDS[county] || [37.0, -120.0];
            return {
                lat: centroid[0],
                lon: centroid[1],
                h3Index: county, // Use county name as ID
                status: job.status,
                foundCount: job.result?.foundCount || 0
            };
        });
    }

    return NextResponse.json({ scans: enrichedScans, mapData });
}
