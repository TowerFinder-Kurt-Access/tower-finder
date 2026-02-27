import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        await requireAdmin();
        const jobId = parseInt(params.id);

        const job = await prisma.jobQueue.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Reset the job to pending
        const updatedJob = await prisma.jobQueue.update({
            where: { id: jobId },
            data: {
                status: 'pending',
                attempts: 0,
                error: null,
                runAfter: new Date(),
                startedAt: null,
                completedAt: null
            }
        });

        return NextResponse.json(updatedJob);
    } catch (error: any) {
        console.error('Failed to retry job:', error);
        return NextResponse.json({ error: 'Failed to retry job' }, { status: 500 });
    }
}
