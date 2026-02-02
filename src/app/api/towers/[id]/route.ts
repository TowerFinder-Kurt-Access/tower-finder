import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/towers/[id] - Get specific tower details
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
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
        const { id } = await params;
        const body = await request.json();
        const { status, type, parcelId, ownerName, ownerAddress, ownerType } = body;

        // Update Tower Basic Info
        let updateData: any = {};
        if (status) updateData.status = status;
        if (type) updateData.type = type;

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
