import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

/**
 * GET /api/admin/discovery-progress
 * Returns all DiscoveryScan records with progress stats.
 * Optionally returns completed cell coordinates for map visualization.
 */
export async function GET(req: Request) {
    try {
        await requireAdmin();
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const includeMap = searchParams.get('includeMap') === 'true';
    const scanState = searchParams.get('state');

    // Get all scans or filter by state
    const scans = await (prisma as any).discoveryScan.findMany({
        where: scanState ? { state: scanState } : {},
        orderBy: { createdAt: 'desc' },
    });

    // Compute derived stats
    const enrichedScans = scans.map((scan: any) => {
        const pct = scan.totalCells > 0
            ? ((scan.completedCells / scan.totalCells) * 100)
            : 0;

        return {
            ...scan,
            progressPercent: Math.round(pct * 100) / 100,
            remainingCells: scan.totalCells - scan.completedCells - scan.failedCells,
            estimatedTimeMinutes: scan.completedCells > 0
                ? Math.round(((scan.totalCells - scan.completedCells - scan.failedCells) * 2) / 60)
                : null,
        };
    });

    // If map data requested, get completed job coordinates for a specific scan
    let mapData: any[] = [];
    if (includeMap && scanState) {
        const scan = scans.find((s: any) => s.state === scanState);
        if (scan) {
            const completedJobs = await prisma.jobQueue.findMany({
                where: {
                    jobType: 'fcc_rooftop_discovery',
                    status: 'completed',
                    params: { path: ['scanId'], equals: scan.id },
                },
                select: { params: true, result: true },
                take: 5000,
            });

            const pendingJobs = await prisma.jobQueue.findMany({
                where: {
                    jobType: 'fcc_rooftop_discovery',
                    status: { in: ['pending', 'processing'] },
                    params: { path: ['scanId'], equals: scan.id },
                },
                select: { params: true },
                take: 5000,
            });

            const failedJobs = await prisma.jobQueue.findMany({
                where: {
                    jobType: 'fcc_rooftop_discovery',
                    status: 'failed',
                    params: { path: ['scanId'], equals: scan.id },
                },
                select: { params: true },
                take: 5000,
            });

            mapData = [
                ...completedJobs.map((j: any) => ({
                    lat: j.params?.lat,
                    lon: j.params?.lon,
                    h3Index: j.params?.h3Index,
                    status: 'completed',
                    foundCount: j.result?.foundCount || 0,
                })),
                ...pendingJobs.map((j: any) => ({
                    lat: j.params?.lat,
                    lon: j.params?.lon,
                    h3Index: j.params?.h3Index,
                    status: 'pending',
                    foundCount: 0,
                })),
                ...failedJobs.map((j: any) => ({
                    lat: j.params?.lat,
                    lon: j.params?.lon,
                    h3Index: j.params?.h3Index,
                    status: 'failed',
                    foundCount: 0,
                })),
            ];
        }
    }

    return NextResponse.json({
        scans: enrichedScans,
        mapData,
    });
}
