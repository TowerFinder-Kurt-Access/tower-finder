/**
 * Admins who may not enter the Superpowers area.
 *
 * Demoting the account would also strip every other admin right, so the block
 * sits beside the role check instead. Configure it with a comma separated list:
 *
 *   SUPERPOWERS_DENIED_EMAILS=cruz@example.com
 *   SUPERPOWERS_DENIED_USER_IDS=3
 *
 * Both variables are server only. The values never reach the browser bundle.
 */

function parseList(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
}

const DENIED_EMAILS = new Set(parseList(process.env.SUPERPOWERS_DENIED_EMAILS));
const DENIED_IDS = new Set(parseList(process.env.SUPERPOWERS_DENIED_USER_IDS));

export interface SuperpowersIdentity {
    id?: string | number | null;
    email?: string | null;
}

/** True when the account keeps an admin role but may not open Superpowers. */
export function isSuperpowersDenied(identity: SuperpowersIdentity | null | undefined): boolean {
    if (!identity) return false;

    const email = identity.email?.trim().toLowerCase();
    if (email && DENIED_EMAILS.has(email)) return true;

    if (identity.id === null || identity.id === undefined) return false;
    const id = String(identity.id).trim();
    return id.length > 0 && DENIED_IDS.has(id);
}
