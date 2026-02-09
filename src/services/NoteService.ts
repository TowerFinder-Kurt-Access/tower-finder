import { prisma } from '@/lib/prisma';

export class NoteService {

    /**
     * Get all notes for a tower, ordered by most recent first
     */
    static async getNotesForTower(towerId: number) {
        return await prisma.note.findMany({
            where: { towerId },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Create a new note for a tower
     */
    static async createNote(towerId: number, content: string, authorId: number) {
        return await prisma.note.create({
            data: {
                towerId,
                content,
                authorId
            },
            include: {
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });
    }

    /**
     * Update an existing note
     */
    static async updateNote(noteId: number, data: { content?: string }) {
        return await prisma.note.update({
            where: { id: noteId },
            data
        });
    }

    /**
     * Delete a note
     */
    static async deleteNote(noteId: number) {
        return await prisma.note.delete({
            where: { id: noteId }
        });
    }

    /**
     * Get a single note by ID
     */
    static async getNoteById(noteId: number) {
        return await prisma.note.findUnique({
            where: { id: noteId }
        });
    }
}
