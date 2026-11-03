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

        const document = await prisma.towerDocument.findUnique({
            where: { id: documentId },
            select: {
                id: true,
                towerId: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                data: true,
                lastOpenedAt: true,
                lastOpenedById: true,
            },
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        if (!(await canAccessTower(user.id, user.role, document.towerId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Files never change after upload, so the bytes can be reused for a day.
        const etag = '"doc-' + document.id + '-' + document.sizeBytes + '"';

        if (request.headers.get('if-none-match') === etag) {
            return new NextResponse(null, {
                status: 304,
                headers: { ETag: etag, 'Cache-Control': 'private, max-age=86400, immutable' },
            });
        }

        // One open per user per minute, so a double fetch does not double count.
        const openedRecently = document.lastOpenedAt !== null
            && document.lastOpenedById === user.id
            && Date.now() - document.lastOpenedAt.getTime() < 60_000;

        if (!openedRecently) {
            await prisma.towerDocument.update({
                where: { id: documentId },
                data: {
                    lastOpenedAt: new Date(),
                    lastOpenedById: user.id,
                    openCount: { increment: 1 },
                },
            });
        }

        const safeName = document.fileName.replace(/[\r\n"]/g, '');
        const wantsDownload = new URL(request.url).searchParams.get('download') === '1';
        const wantsInline = document.mimeType === 'application/pdf' && !wantsDownload;

        return new NextResponse(new Uint8Array(document.data), {
            headers: {
                'Content-Type': document.mimeType,
                'Content-Length': String(document.sizeBytes),
                'Content-Disposition': (wantsInline ? 'inline' : 'attachment') + '; filename="' + safeName + '"',
                'X-Content-Type-Options': 'nosniff',
                ETag: etag,
                'Cache-Control': wantsInline
                    ? 'private, max-age=86400, immutable'
                    : 'private, no-store',
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
