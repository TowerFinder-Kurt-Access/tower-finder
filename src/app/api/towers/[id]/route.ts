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
                        },
                        city: true,
                        province: true
                    }
                },
                type: true,
                carrier: true,
                status: true,
                phones: {
                    orderBy: { createdAt: 'asc' }
                },
                notes: {
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
                },
                businessesNearby: {
                    orderBy: { distance: 'asc' }
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
        const { statusId, parcelId, ownerName, ownerAddress, ownerType, streetViewUrl,
            typeId, carrierId, parcelUpdate } = body;

        // Update Tower Basic Info
        let updateData: any = {};
        if (statusId !== undefined) updateData.statusId = statusId;
        if (streetViewUrl !== undefined) updateData.streetViewUrl = streetViewUrl;
        if (typeId !== undefined) updateData.typeId = typeId;
        if (carrierId !== undefined) updateData.carrierId = carrierId;

        // Handle parcel address field updates
        if (parcelUpdate) {
            const parcelFields: any = {};
            const allowedFields = ['address', 'streetNumber', 'streetName', 'streetType', 'streetDir',
                'unit', 'postalCode', 'cityRaw', 'provinceRaw', 'stateRaw', 'county'];
            for (const field of allowedFields) {
                if (parcelUpdate[field] !== undefined) {
                    parcelFields[field] = parcelUpdate[field] || null;
                }
            }

            if (Object.keys(parcelFields).length > 0) {
                updateData.parcel = {
                    upsert: {
                        create: parcelFields,
                        update: parcelFields
                    }
                };
            }
        }

        // Handle Owner upsert if provided
        if (ownerName) {
            updateData.parcel = {
                upsert: {
                    create: {
                        parcelId: parcelId,
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
                        owner: true,
                        city: true,
                        province: true
                    }
                },
                type: true,
                carrier: true,
                status: true
            }
        });

        return NextResponse.json(updatedTower);
    } catch (error) {
        console.error(`Error updating tower:`, error);
        return NextResponse.json({ error: 'Failed to update tower' }, { status: 500 });
    }
}
