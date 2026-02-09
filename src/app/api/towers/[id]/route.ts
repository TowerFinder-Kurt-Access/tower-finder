import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/towers/[id] - Get specific tower details
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const { id } = await params;
        const towerId = parseInt(id);

        // Check access
        const hasAccess = await canAccessTower(user.id, user.role, towerId);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden - You do not have access to this tower' }, { status: 403 });
        }

        const tower = await prisma.tower.findUnique({
            where: { id: parseInt(id) },
            include: {
                parcel: {
                    include: {
                        owner: {
                            include: {
                                contacts: true
                            }
                        }
                    }
                },
                notes: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!tower) {
            return NextResponse.json({ error: 'Tower not found' }, { status: 404 });
        }

        return NextResponse.json(tower);
    } catch (error) {
        console.error(`Error fetching tower:`, error);
        return NextResponse.json({ error: 'Failed to fetch tower' }, { status: 500 });
    }
}

// PATCH /api/towers/[id] - Update tower status or link parcel/owner
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const user = await getAuthUser();
        const { id } = await params;
        const towerId = parseInt(id);

        // Check access
        const hasAccess = await canAccessTower(user.id, user.role, towerId);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden - You do not have access to this tower' }, { status: 403 });
        }

        const body = await request.json();
        const { status, type, parcelId, ownerName, ownerAddress, ownerType, streetViewUrl } = body;

        // Update Tower Basic Info
        let updateData: any = {};
        if (status) updateData.status = status;
        if (type) updateData.type = type;
        if (streetViewUrl !== undefined) updateData.streetViewUrl = streetViewUrl;

        // Handle Parcel/Owner updates if provided
        // This is a simplified "Upsert" logic where we assume we are setting the parcel info for this tower
        if (ownerName) {
            updateData.parcel = {
                upsert: {
                    create: {
                        parcelId: parcelId, // Optional
                        owner: {
                            create: {
                                name: ownerName,
                                address: ownerAddress,
                                type: ownerType
                            }
                        }
                    },
                    update: {
                        parcelId: parcelId,
                        owner: {
                            upsert: {
                                create: {
                                    name: ownerName,
                                    address: ownerAddress,
                                    type: ownerType
                                },
                                update: {
                                    name: ownerName,
                                    address: ownerAddress || undefined,
                                    type: ownerType || undefined
                                }
                            }
                        }
                    }
                }
            };
        }

        const updatedTower = await prisma.tower.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                parcel: {
                    include: {
                        owner: true
                    }
                }
            }
        });

        return NextResponse.json(updatedTower);
    } catch (error) {
        console.error(`Error updating tower:`, error);
        return NextResponse.json({ error: 'Failed to update tower' }, { status: 500 });
    }
}
