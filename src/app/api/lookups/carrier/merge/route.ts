import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-helpers';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        const body = await request.json();
        const { sourceIds, targetName } = body;

        if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !targetName?.trim()) {
            return NextResponse.json(
                { error: 'sourceIds array and targetName are required' },
                { status: 400 }
            );
        }

        const formattedTargetName = targetName.trim();

        // Use a transaction to ensure all operations succeed or fail together
        const result = await prisma.$transaction(async (tx) => {
            // 1. Find or create the target carrier
            let targetCarrier = await tx.carrier.findFirst({
                where: {
                    name: {
                        equals: formattedTargetName,
                        mode: 'insensitive' // Optional: case-insensitive match
                    }
                }
            });

            if (!targetCarrier) {
                targetCarrier = await tx.carrier.create({
                    data: { name: formattedTargetName }
                });
            }

            const targetId = targetCarrier.id;

            // 2. Update all towers that reference the source carriers to point to target carrier
            const updateResult = await tx.tower.updateMany({
                where: {
                    carrierId: {
                        in: sourceIds
                    },
                    // Prevent updating if it already is the target (optimization and loop prevention)
                    NOT: {
                        carrierId: targetId
                    }
                },
                data: {
                    carrierId: targetId
                }
            });

            // 3. Delete the old carriers that were merged
            const idsToDelete = sourceIds.filter(id => id !== targetId);

            let deleteResult = { count: 0 };
            if (idsToDelete.length > 0) {
                deleteResult = await tx.carrier.deleteMany({
                    where: {
                        id: {
                            in: idsToDelete
                        }
                    }
                });
            }

            return {
                targetCarrier,
                towersUpdated: updateResult.count,
                carriersDeleted: deleteResult.count
            };
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error merging carriers:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to merge carriers' },
            { status: 500 }
        );
    }
}
