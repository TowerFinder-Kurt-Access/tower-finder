import { COMMON_PASSWORDS } from './common-passwords';

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Password rules from the Login Security review (2025-07):
 * at least 10 chars, upper + lower + digit + special, and not one of the
 * 1,000 most common passwords. Returns an error message, or null when valid.
 */
export function validatePassword(password: string): string | null {
    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
    if (!/[a-z]/.test(password)) {
        return 'Password must include a lowercase letter';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must include an uppercase letter';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must include a number';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return 'Password must include a special character';
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return 'Password is too common — choose something less guessable';
    }
    return null;
}
