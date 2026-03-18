import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        const body = await request.json();
        const { type, name } = body;

        if (!type || !name?.trim()) {
            return NextResponse.json(
                { error: 'Type and name are required' },
                { status: 400 }
            );
        }

        let result;

        switch (type) {
            case 'type':
                result = await prisma.towerType.create({
                    data: { name: name.trim() }
                });
                break;
            case 'carrier':
                result = await prisma.carrier.create({
                    data: { name: name.trim() }
                });
                break;
            case 'status':
                result = await prisma.towerStatus.create({
                    data: { name: name.trim() }
                });
                break;
            default:
                return NextResponse.json(
                    { error: `Invalid type: ${type}. Must be 'type', 'carrier', or 'status'.` },
                    { status: 400 }
                );
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error creating lookup:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create lookup' },
            { status: 500 }
        );
    }
}
