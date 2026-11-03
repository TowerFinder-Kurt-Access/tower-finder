import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// DELETE /api/documents/[id] - uploader or admin only
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const documentId = parseInt((await params).id, 10);

        if (isNaN(documentId)) {
            return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
        }

        const document = await prisma.towerDocument.findUnique({
            where: { id: documentId },
            select: { id: true, towerId: true, uploadedById: true },
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        if (!(await canAccessTower(user.id, user.role, document.towerId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const isUploader = document.uploadedById === user.id;
        const isAdmin = user.role === 'ADMIN';

        if (!isUploader && !isAdmin) {
            return NextResponse.json({ error: 'Only the uploader or an admin can delete this file' }, { status: 403 });
        }

        await prisma.towerDocument.delete({ where: { id: documentId } });
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error deleting document:', error);
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }
}
