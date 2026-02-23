import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        await requireAdmin();
        const { type, id } = await params;
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

        const body = await request.json();
        const { name } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        let result;
        const data = { name: name.trim() };

        switch (type) {
            case 'type':
                result = await prisma.towerType.update({ where: { id: numericId }, data });
                break;
            case 'carrier':
                result = await prisma.carrier.update({ where: { id: numericId }, data });
                break;
            case 'licensee':
                result = await prisma.licensee.update({ where: { id: numericId }, data });
                break;
            case 'status':
                result = await prisma.towerStatus.update({ where: { id: numericId }, data });
                break;
            default:
                return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error updating lookup:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: `Name already exists.` }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to update lookup' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    try {
        await requireAdmin();
        const { type, id } = await params;
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

        let result;

        switch (type) {
            case 'type':
                result = await prisma.towerType.delete({ where: { id: numericId } });
                break;
            case 'carrier':
                result = await prisma.carrier.delete({ where: { id: numericId } });
                break;
            case 'licensee':
                result = await prisma.licensee.delete({ where: { id: numericId } });
                break;
            case 'status':
                result = await prisma.towerStatus.delete({ where: { id: numericId } });
                break;
            default:
                return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
        }

        return NextResponse.json({ success: true, deleted: result });
    } catch (error: any) {
        console.error('Error deleting lookup:', error);
        // Specifically catch foreign key constraint failures (e.g., trying to delete a status used by a tower)
        if (error.code === 'P2003') {
            return NextResponse.json(
                { error: 'Cannot delete because it is currently in use by one or more towers.' },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: 'Failed to delete lookup' }, { status: 500 });
    }
}
