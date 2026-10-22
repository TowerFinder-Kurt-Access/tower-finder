import type { LeadStage } from '@prisma/client';

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
    PROSPECTIVE: 'Prospective Clients',
    LATER_OUTREACH: 'For Later Outreach',
    NOT_INTERESTED: 'Not Interested',
    LARRYS_CORNER: "Larry's Corner",
};

/** Trim, collapse inner runs of whitespace, and drop empty strings. */
export function cleanText(value: string | null | undefined): string | null {
    if (value == null) return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
}

/** The workbook marks anonymous contacts with several spellings; none are a name. */
export function isUndisclosedContact(value: string | null | undefined): boolean {
    return value != null && /^undisclosed( name)?$/i.test(value.trim());
}

export function cleanPersonName(value: string | null | undefined): string | null {
    if (isUndisclosedContact(value)) return null;
    return cleanText(value);
}

export function cleanCompanyName(value: string | null | undefined): string | null {
    return cleanText(value);
}

export interface ContactSource {
    contactPerson: string | null;
    companyName: string | null;
}

export interface OwnerSource {
    name: string;
    type: string | null;
}

export interface ResolvedContact {
    contactPerson: string | null;
    companyName: string | null;
}

/**
 * Fill what the lead is missing from the parcel's property owner record.
 * An `Individual` owner is a person, so it only fills the contact column; any
 * other owner type is an organisation, so it only fills the company column.
 */
export function resolveContact(
    lead: ContactSource | null | undefined,
    owner: OwnerSource | null | undefined
): ResolvedContact {
    const contactPerson = cleanPersonName(lead?.contactPerson);
    const companyName = cleanCompanyName(lead?.companyName);
    const ownerName = cleanText(owner?.name);
    const ownerIsPerson = owner?.type?.toLowerCase() === 'individual';

    return {
        contactPerson: contactPerson ?? (ownerIsPerson ? ownerName : null),
        companyName: companyName ?? (ownerIsPerson ? null : ownerName),
    };
}
