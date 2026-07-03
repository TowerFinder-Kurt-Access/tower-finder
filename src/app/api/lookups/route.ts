import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: Request) {
    try {
        await getAuthUser();
        const body = await request.json();
        const { type, name } = body;

        if (!type || !name?.trim()) {
            return NextResponse.json(
                { error: 'Type and name are required' },
                { status: 400 }
            );
        }

        const trimmedName = name.trim();

        // Reuse an existing lookup that only differs by case/whitespace instead of
        // creating a near-duplicate row (the names have no DB unique constraint).
        const findExisting = (model: typeof prisma.towerType | typeof prisma.carrier | typeof prisma.towerStatus) =>
            (model as any).findFirst({ where: { name: { equals: trimmedName, mode: 'insensitive' } } });

        let result;

        switch (type) {
            case 'type':
                result = await findExisting(prisma.towerType)
                    ?? await prisma.towerType.create({ data: { name: trimmedName } });
                break;
            case 'carrier':
                result = await findExisting(prisma.carrier)
                    ?? await prisma.carrier.create({ data: { name: trimmedName } });
                break;
            case 'status':
                result = await findExisting(prisma.towerStatus)
                    ?? await prisma.towerStatus.create({ data: { name: trimmedName } });
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
