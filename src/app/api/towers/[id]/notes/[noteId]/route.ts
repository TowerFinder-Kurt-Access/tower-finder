import { NextResponse } from 'next/server';
import { NoteService } from '@/services/NoteService';
import { getAuthUser, getInitials } from '@/lib/auth-helpers';

interface RouteParams {
    params: Promise<{ id: string; noteId: string }>;
}

// PATCH /api/towers/[id]/notes/[noteId] - Update a note
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const { noteId } = await params;
        const noteIdNum = parseInt(noteId);

        if (isNaN(noteIdNum)) {
            return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
        }

        const body = await request.json();
        const { content } = body;

        const updateData: { content?: string, initials?: string } = {};
        if (content !== undefined) {
            updateData.content = content.trim();
            updateData.initials = getInitials(user.name);
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No update data provided' }, { status: 400 });
        }

        const note = await NoteService.updateNote(noteIdNum, updateData);
        return NextResponse.json(note);
    } catch (error) {
        console.error('Error updating note:', error);
        return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
    }
}

// DELETE /api/towers/[id]/notes/[noteId] - Delete a note
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        await getAuthUser();
        const { noteId } = await params;
        const noteIdNum = parseInt(noteId);

        if (isNaN(noteIdNum)) {
            return NextResponse.json({ error: 'Invalid note ID' }, { status: 400 });
        }

        await NoteService.deleteNote(noteIdNum);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }
}
