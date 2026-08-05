// Pure policy constants/helpers — no Node or Prisma imports, so this module is
// safe to import from edge middleware (via auth.config.ts).

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_MAX_AGE_DAYS = 180;

/** Whole days since the password was last changed. */
export function passwordAgeDays(passwordChangedAt: Date): number {
    return Math.floor((Date.now() - passwordChangedAt.getTime()) / (24 * 60 * 60 * 1000));
}