import type { LeadStage, Prisma } from '@prisma/client';
import { LeadStage as LeadStageValues } from '@prisma/client';
import { cleanText, resolveContact, type LeadRow } from './leads';

export const leadInclude = {
    tower: {
        include: {
            parcel: { include: { owner: { include: { contacts: true } } } },
        },
    },
} satisfies Prisma.LeadInclude;

export type LeadWithTower = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

/** Turns a stored lead into the shape the list and drawer render. */
export function toLeadRow(lead: LeadWithTower): LeadRow {
    const parcel = lead.tower.parcel;
    const owner = parcel?.owner;
    const contacts = resolveContact(lead, owner);
    const phone = owner?.contacts.find((contact) => contact.type.toLowerCase() === 'phone');

    return {
        id: lead.id,
        stage: lead.customStageKey ?? lead.stage,
        contactPerson: contacts.contactPerson,
        companyName: contacts.companyName,
        actions: lead.actions,
        remarks: lead.remarks,
        brettStatus: lead.brettStatus,
        emailFollowUp: lead.emailFollowUp,
        towerId: lead.towerId,
        address: parcel?.address ?? null,
        city: parcel?.cityRaw ?? null,
        state: parcel?.stateRaw ?? parcel?.provinceRaw ?? null,
        ownerName: owner?.name ?? null,
        ownerType: owner?.type ?? null,
        ownerPhone: phone?.value?.trim() ?? null,
    };
}

const TEXT_FIELDS = ['contactPerson', 'companyName', 'actions', 'remarks', 'brettStatus'] as const;

export type LeadFieldInput = Prisma.LeadUncheckedUpdateInput;

/** Validates the editable lead fields. Absent keys stay untouched, so PATCH and POST share it. */
export function readLeadFields(body: unknown): { data: LeadFieldInput; error?: string } {
    const data: LeadFieldInput = {};
    if (!body || typeof body !== 'object') return { data, error: 'Invalid request body' };
    const input = body as Record<string, unknown>;

    for (const field of TEXT_FIELDS) {
        if (!(field in input)) continue;
        const value = input[field];
        if (value !== null && typeof value !== 'string') return { data, error: `${field} must be text` };
        data[field] = cleanText(value as string | null);
    }

    if ('emailFollowUp' in input) {
        if (typeof input.emailFollowUp !== 'boolean') return { data, error: 'emailFollowUp must be true or false' };
        data.emailFollowUp = input.emailFollowUp;
    }

    if ('stage' in input) {
        const value = input.stage;
        if (typeof value !== 'string' || !value.trim()) {
            return { data, error: 'Unknown stage' };
        }
        const key = value.trim();
        if (key in LeadStageValues) {
            data.stage = key as LeadStage;
            data.customStageKey = null;
        } else if (/^[a-z0-9_]+$/.test(key)) {
            // Custom stage keys are checked against LeadCustomStage by the API.
            data.stage = LeadStageValues.PROSPECTIVE;
            data.customStageKey = key;
        } else {
            return { data, error: 'Unknown stage' };
        }
    }

    if ('towerId' in input) {
        const towerId = Number(input.towerId);
        if (!Number.isInteger(towerId) || towerId <= 0) return { data, error: 'Invalid tower ID' };
        data.towerId = towerId;
    }

    return { data };
}
