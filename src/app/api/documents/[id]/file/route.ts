import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/documents/[id]/file - serve the file inline and record the open
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const documentId = parseInt((await params).id, 10);

        if (isNaN(documentId)) {
            return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
        }

        const document = await prisma.towerDocument.findUnique({ where: { id: documentId } });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        if (!(await canAccessTower(user.id, user.role, document.towerId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.towerDocument.update({
            where: { id: documentId },
            data: {
                lastOpenedAt: new Date(),
                lastOpenedById: user.id,
                openCount: { increment: 1 },
            },
        });

        const safeName = document.fileName.replace(/[\r\n"]/g, '');
        const wantsInline = document.mimeType === 'application/pdf';

        return new NextResponse(new Uint8Array(document.data), {
            headers: {
                'Content-Type': document.mimeType,
                'Content-Length': String(document.sizeBytes),
                'Content-Disposition': (wantsInline ? 'inline' : 'attachment') + '; filename="' + safeName + '"',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error serving document:', error);
        return NextResponse.json({ error: 'Failed to serve document' }, { status: 500 });
    }
}
