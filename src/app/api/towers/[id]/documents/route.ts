import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';

interface RouteParams {
    params: Promise<{ id: string }>;
}

const MAX_BYTES = 10 * 1024 * 1024;

// Word formats are stored, PDFs are stored and previewed inline.
const ALLOWED = new Map<string, string>([
    ['.pdf', 'application/pdf'],
    ['.doc', 'application/msword'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['.docm', 'application/vnd.ms-word.document.macroEnabled.12'],
]);

function extensionOf(name: string): string {
    const index = name.lastIndexOf('.');
    return index === -1 ? '' : name.slice(index).toLowerCase();
}

// GET /api/towers/[id]/documents - list metadata only, never the file bytes
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const towerId = parseInt((await params).id, 10);

        if (isNaN(towerId)) {
            return NextResponse.json({ error: 'Invalid tower ID' }, { status: 400 });
        }

        if (!(await canAccessTower(user.id, user.role, towerId))) {
            return NextResponse.json({ error: 'Forbidden - You do not have access to this tower' }, { status: 403 });
        }

        const documents = await prisma.towerDocument.findMany({
            where: { towerId },
            orderBy: { uploadedAt: 'desc' },
            select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                uploadedAt: true,
                lastOpenedAt: true,
                openCount: true,
                uploadedBy: { select: { id: true, name: true } },
                lastOpenedBy: { select: { id: true, name: true } },
            },
        });

        return NextResponse.json(documents);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching tower documents:', error);
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }
}

// POST /api/towers/[id]/documents - upload one document
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const towerId = parseInt((await params).id, 10);

        if (isNaN(towerId)) {
            return NextResponse.json({ error: 'Invalid tower ID' }, { status: 400 });
        }

        if (!(await canAccessTower(user.id, user.role, towerId))) {
            return NextResponse.json({ error: 'Forbidden - You do not have access to this tower' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'A file is required' }, { status: 400 });
        }

        const extension = extensionOf(file.name);
        const expectedType = ALLOWED.get(extension);

        if (!expectedType) {
            return NextResponse.json(
                { error: 'Only .pdf, .doc, .docx and .docm files are allowed' },
                { status: 415 }
            );
        }

        if (file.size === 0) {
            return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
        }

        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: 'Files must be 10 MB or smaller' }, { status: 413 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const document = await prisma.towerDocument.create({
            data: {
                towerId,
                fileName: file.name,
                mimeType: expectedType,
                sizeBytes: buffer.length,
                data: buffer,
                uploadedById: user.id,
            },
            select: {
                id: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                uploadedAt: true,
                openCount: true,
                uploadedBy: { select: { id: true, name: true } },
            },
        });

        return NextResponse.json(document, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error uploading tower document:', error);
        return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
    }
}
