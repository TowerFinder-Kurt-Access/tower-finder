import type { LoginEventType } from '@prisma/client';

export type LoginEventFamily = 'session' | 'account' | 'password' | 'otp';
export type LoginEventTone = 'success' | 'failure' | 'warning' | 'info' | 'accent' | 'neutral';

export interface LoginEventMeta {
    label: string;
    family: LoginEventFamily;
    tone: LoginEventTone;
}

/**
 * Display names for the Prisma `LoginEventType` enum. The record is keyed by the
 * enum, so adding a value to schema.prisma breaks the build until this map and
 * LOGIN_EVENT_FAMILIES cover it.
 */
export const LOGIN_EVENT_META = {
    LOGIN_SUCCESS: { label: 'Login success', family: 'session', tone: 'success' },
    LOGIN_FAILED: { label: 'Login failed', family: 'session', tone: 'failure' },
    LOGIN_LOCKED: { label: 'Login locked', family: 'session', tone: 'warning' },
    USER_NOT_FOUND: { label: 'User not found', family: 'account', tone: 'failure' },
    WRONG_PASSWORD: { label: 'Wrong password', family: 'account', tone: 'failure' },
    ACCOUNT_INACTIVE: { label: 'Account inactive', family: 'account', tone: 'warning' },
    ACCOUNT_DEACTIVATED: { label: 'Account deactivated', family: 'account', tone: 'warning' },
    PASSWORD_CHANGED: { label: 'Password changed', family: 'password', tone: 'accent' },
    PASSWORD_RESET: { label: 'Password reset', family: 'password', tone: 'accent' },
    OTP_SENT: { label: 'Code sent', family: 'otp', tone: 'info' },
    OTP_DELIVERY_FAILED: { label: 'Code delivery failed', family: 'otp', tone: 'failure' },
    OTP_VERIFIED: { label: 'Code verified', family: 'otp', tone: 'success' },
    OTP_FAILED: { label: 'Code failed', family: 'otp', tone: 'failure' },
    OTP_EXPIRED: { label: 'Code expired', family: 'otp', tone: 'warning' },
    OTP_MAX_ATTEMPTS: { label: 'Code max attempts', family: 'otp', tone: 'failure' },
    OTP_COOLDOWN: { label: 'Code cooldown', family: 'otp', tone: 'warning' },
    LOGOUT: { label: 'Logout', family: 'session', tone: 'neutral' },
    SESSION_REVOKED: { label: 'Session revoked', family: 'session', tone: 'warning' },
    SESSION_EXPIRED: { label: 'Session expired', family: 'session', tone: 'warning' },
} satisfies Record<LoginEventType, LoginEventMeta>;

export interface LoginEventFamilyMeta {
    key: LoginEventFamily;
    label: string;
    types: LoginEventType[];
}

export const LOGIN_EVENT_FAMILIES: ReadonlyArray<LoginEventFamilyMeta> = [
    {
        key: 'session',
        label: 'Session',
        types: [
            'LOGIN_SUCCESS',
            'LOGIN_FAILED',
            'LOGIN_LOCKED',
            'LOGOUT',
            'SESSION_REVOKED',
            'SESSION_EXPIRED',
        ],
    },
    {
        key: 'account',
        label: 'Account',
        types: ['USER_NOT_FOUND', 'WRONG_PASSWORD', 'ACCOUNT_INACTIVE', 'ACCOUNT_DEACTIVATED'],
    },
    { key: 'password', label: 'Password', types: ['PASSWORD_CHANGED', 'PASSWORD_RESET'] },
    {
        key: 'otp',
        label: 'One-time code',
        types: [
            'OTP_SENT',
            'OTP_DELIVERY_FAILED',
            'OTP_VERIFIED',
            'OTP_FAILED',
            'OTP_EXPIRED',
            'OTP_MAX_ATTEMPTS',
            'OTP_COOLDOWN',
        ],
    },
];

/** Solid colors per family, used by the stacked proportion bar. */
export const FAMILY_COLOR = {
    session: '#34d399',
    account: '#fb7185',
    password: '#a78bfa',
    otp: '#60a5fa',
} satisfies Record<LoginEventFamily, string>;

export interface ToneStyle {
    fg: string;
    bg: string;
    border: string;
}

export const TONE_STYLES = {
    success: { fg: '#34d399', bg: 'rgba(52, 211, 153, 0.10)', border: 'rgba(52, 211, 153, 0.32)' },
    failure: { fg: '#fb7185', bg: 'rgba(251, 113, 133, 0.10)', border: 'rgba(251, 113, 133, 0.32)' },
    warning: { fg: '#fbbf24', bg: 'rgba(251, 191, 36, 0.10)', border: 'rgba(251, 191, 36, 0.32)' },
    info: { fg: '#60a5fa', bg: 'rgba(96, 165, 250, 0.10)', border: 'rgba(96, 165, 250, 0.32)' },
    accent: { fg: '#a78bfa', bg: 'rgba(167, 139, 250, 0.10)', border: 'rgba(167, 139, 250, 0.32)' },
    neutral: { fg: '#94a3b8', bg: 'rgba(148, 163, 184, 0.10)', border: 'rgba(148, 163, 184, 0.32)' },
} satisfies Record<LoginEventTone, ToneStyle>;

/** Falls back to a neutral chip when the database holds an unmapped enum value. */
export function metaFor(type: LoginEventType): LoginEventMeta {
    return LOGIN_EVENT_META[type] ?? { label: type, family: 'session', tone: 'neutral' };
}
