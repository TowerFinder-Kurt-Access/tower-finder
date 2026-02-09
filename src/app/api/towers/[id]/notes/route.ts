import { NextResponse } from 'next/server';
import { NoteService } from '@/services/NoteService';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/towers/[id]/notes - Get all notes for a tower
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const { id } = await params;
        const towerId = parseInt(id);

        if (isNaN(towerId)) {
            return NextResponse.json({ error: 'Invalid tower ID' }, { status: 400 });
        }

        // Check access
        const hasAccess = await canAccessTower(user.id, user.role, towerId);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden - You do not have access to this tower' }, { status: 403 });
        }

        const notes = await NoteService.getNotesForTower(towerId);
        return NextResponse.json(notes);
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error fetching notes:', error);
        return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
}

// POST /api/towers/[id]/notes - Create a new note
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const { id } = await params;
        const towerId = parseInt(id);

        if (isNaN(towerId)) {
            return NextResponse.json({ error: 'Invalid tower ID' }, { status: 400 });
        }

        // Check access
        const hasAccess = await canAccessTower(user.id, user.role, towerId);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden - You do not have access to this tower' }, { status: 403 });
        }

        const body = await request.json();
        const { content } = body;

        if (!content || !content.trim()) {
            return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
        }

        const note = await NoteService.createNote(towerId, content.trim(), user.id);
        return NextResponse.json(note, { status: 201 });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Error creating note:', error);
        return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }
}
