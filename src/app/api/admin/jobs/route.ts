import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

export async function GET() {
    try {
        await requireAdmin();

        const jobs = await prisma.jobQueue.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100 // Last 100 jobs
        });

        return NextResponse.json(jobs);
    } catch (error: any) {
        if (error.message === 'Forbidden' || error.message === 'Unauthorized') {
            return NextResponse.json({ error: error.message }, { status: 401 });
        }
        console.error('Failed to fetch jobs:', error);
        return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }
}
