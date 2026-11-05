import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth-helpers';
import { canAccessTower } from '@/lib/tower-access';
import { isLeaseExpiryInPast, parseLeaseExpiryDate, toLocalDateString } from '@/lib/lease-expiry';

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
                        province: true,
                        countyNormalized: true
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

        // Lease expiry audit trail: recent changes for the tower's parcel, newest first.
        const leaseExpiryHistory = tower.parcel
            ? await prisma.leaseExpiryHistory.findMany({
                where: { parcelId: tower.parcel.id },
                orderBy: { createdAt: 'desc' },
                take: 5
            })
            : [];

        return NextResponse.json({ ...tower, leaseExpiryHistory });
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
            typeId, carrierId, parcelUpdate, clientToday } = body;

        // Update Tower Basic Info
        let updateData: any = {};
        if (statusId !== undefined) updateData.statusId = statusId;
        if (streetViewUrl !== undefined) updateData.streetViewUrl = streetViewUrl;
        if (typeId !== undefined) updateData.typeId = typeId;
        if (carrierId !== undefined) updateData.carrierId = carrierId;

        // Lease expiry change tracked for the audit row after the update.
        let expiryAudit: { oldValue: Date | null; newValue: Date | null } | null = null;

        // Handle parcel address field updates
        if (parcelUpdate) {
            const parcelFields: any = {};
            const allowedFields = ['address', 'streetNumber', 'streetName', 'streetType', 'streetDir',
                'unit', 'postalCode', 'cityRaw', 'provinceRaw', 'stateRaw', 'countyRaw'];
            for (const field of allowedFields) {
                if (parcelUpdate[field] !== undefined) {
                    parcelFields[field] = parcelUpdate[field] || null;
                }
            }
            // Backward compatibility for 'county' field name if sent from UI
            if (parcelUpdate.county !== undefined) {
                parcelFields.countyRaw = parcelUpdate.county || null;
            }

            // Lease expiry gets validation and an audit row; other parcel fields pass through.
            if (parcelUpdate.leaseExpiry !== undefined) {
                const existing = await prisma.parcel.findUnique({
                    where: { towerId },
                    select: { leaseExpiry: true }
                });
                const oldValue = existing?.leaseExpiry ?? null;
                const oldDay = oldValue ? toLocalDateString(oldValue) : null;

                if (parcelUpdate.leaseExpiry === null || parcelUpdate.leaseExpiry === '') {
                    parcelFields.leaseExpiry = null;
                    if (oldDay) expiryAudit = { oldValue, newValue: null };
                } else {
                    const parsedLeaseExpiry = parseLeaseExpiryDate(parcelUpdate.leaseExpiry);
                    if (!parsedLeaseExpiry) {
                        return NextResponse.json({ error: 'Invalid Lease Expiry date' }, { status: 400 });
                    }
                    // An unchanged stored date may already be expired; only a newly
                    // chosen date is held to the no-past rule, so unrelated edits
                    // still save while an expired lease sits in the field.
                    if (parcelUpdate.leaseExpiry !== oldDay && isLeaseExpiryInPast(parcelUpdate.leaseExpiry, clientToday)) {
                        return NextResponse.json({ error: 'Lease Expiry cannot be in the past' }, { status: 400 });
                    }
                    parcelFields.leaseExpiry = parsedLeaseExpiry;
                    if (parcelUpdate.leaseExpiry !== oldDay) {
                        expiryAudit = { oldValue, newValue: parsedLeaseExpiry };
                    }
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
                        province: true,
                        countyNormalized: true
                    }
                },
                type: true,
                carrier: true,
                status: true
            }
        });

        // Audit row goes in after the parcel exists (the upsert may have created it).
        // A failed audit write must not fail the update it just recorded.
        if (expiryAudit && updatedTower.parcel) {
            try {
                await prisma.leaseExpiryHistory.create({
                    data: {
                        parcelId: updatedTower.parcel.id,
                        oldValue: expiryAudit.oldValue,
                        newValue: expiryAudit.newValue,
                        userName: user.name
                    }
                });
            } catch (auditError) {
                console.error('Failed to write lease expiry history:', auditError);
            }
        }

        return NextResponse.json(updatedTower);
    } catch (error) {
        console.error(`Error updating tower:`, error);
        return NextResponse.json({ error: 'Failed to update tower' }, { status: 500 });
    }
}
