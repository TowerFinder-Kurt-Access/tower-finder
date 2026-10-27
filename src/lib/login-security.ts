import { prisma } from '@/lib/prisma';
import { LoginEventType, Prisma } from '@prisma/client';
import { LOCKOUT_WINDOW_MS, MAX_FAILED_ATTEMPTS } from '@/lib/security-policy';

export { LOCKOUT_WINDOW_MS, MAX_FAILED_ATTEMPTS, PASSWORD_MAX_AGE_DAYS, passwordAgeDays } from '@/lib/security-policy';

export interface LoginEventInput {
    email: string;
    userId?: number;
    type: LoginEventType;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
}

/** Best-effort client IP from request headers. Prefer the proxy-set
 *  header; fall back to the leftmost X-Forwarded-For hop. */
export function requestIp(request: Request | null | undefined): string | null {
    const real = request?.headers.get('x-real-ip');
    if (real) return real.trim();
    const fwd = request?.headers.get('x-forwarded-for');
    return fwd ? fwd.split(',')[0].trim() : null;
}

// ponytail: in-memory IP limiter, per-instance only — use Redis/Upstash if you need cross-instance limits
const ipHits = new Map<string, number[]>();
export function isIpRateLimited(ip: string | null, max = 5, windowMs = 60_000): boolean {
    if (!ip) return false;
    const now = Date.now();
    const hits = ipHits.get(ip) ?? [];
    const recent = hits.filter(t => now - t < windowMs);
    recent.push(now);
    ipHits.set(ip, recent);
    // prune old IPs occasionally to cap memory
    if (ipHits.size > 2000) {
        for (const [k, v] of ipHits) if (v.length === 0 || now - Math.max(...v) > windowMs) ipHits.delete(k);
    }
    return recent.length > max;
}

export function recordLoginEvent(event: LoginEventInput) {
    return prisma.loginEvent.create({
        data: {
            // Stored lower-cased so the lockout count cannot be evaded by
            // changing the letter case of the same address.
            email: event.email.trim().toLowerCase(),
            userId: event.userId ?? null,
            type: event.type,
            ip: event.ip ?? null,
            userAgent: event.userAgent ?? null,
            // SAFETY: callers build these objects as plain JSON literals (see recordLoginEvent callers).
            metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
    });
}

/** True when the email has >= MAX_FAILED_ATTEMPTS failures within LOCKOUT_WINDOW_MS. */
export async function isLockedOut(email: string): Promise<boolean> {
    const recentFailures = await prisma.loginEvent.count({
        where: {
            email: email.trim().toLowerCase(),
            type: LoginEventType.LOGIN_FAILED,
            createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
        },
    });
    return recentFailures >= MAX_FAILED_ATTEMPTS;
}

/** Seconds until the lockout lifts (0 when not locked). Mirrors the sliding
 *  window in isLockedOut: the 5th-newest failure plus the window is when the
 *  failure count finally drops below MAX_FAILED_ATTEMPTS. */
export async function getLockoutRemainingSeconds(email: string): Promise<number> {
    const recent = await prisma.loginEvent.findMany({
        where: {
            email: email.trim().toLowerCase(),
            type: LoginEventType.LOGIN_FAILED,
            createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_FAILED_ATTEMPTS,
        select: { createdAt: true },
    });
    if (recent.length < MAX_FAILED_ATTEMPTS) return 0;
    const unlockAt = recent[MAX_FAILED_ATTEMPTS - 1].createdAt.getTime() + LOCKOUT_WINDOW_MS;
    return Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
}

/** Durable login throttle: too many failed logins from one IP address. */
export async function isLoginIpBudgetExhausted(ip: string | null): Promise<boolean> {
    if (!ip) return false;
    const failures = await prisma.loginEvent.count({
        where: {
            ip,
            type: LoginEventType.LOGIN_FAILED,
            createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
    });
    return failures >= 30;
}

export const OTP_SEND_BUDGET_MAX = 20;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

/** Seconds until the hourly OTP send budget frees up (0 when open). */
export async function getOtpSendBudgetWaitSeconds(email: string): Promise<number> {
    const recent = await prisma.loginEvent.findMany({
        where: {
            email: email.trim().toLowerCase(),
            type: LoginEventType.OTP_SENT,
            createdAt: { gte: new Date(Date.now() - OTP_SEND_WINDOW_MS) },
        },
        orderBy: { createdAt: 'desc' },
        take: OTP_SEND_BUDGET_MAX,
        select: { createdAt: true },
    });
    if (recent.length < OTP_SEND_BUDGET_MAX) return 0;
    const freeAt = recent[OTP_SEND_BUDGET_MAX - 1].createdAt.getTime() + OTP_SEND_WINDOW_MS;
    return Math.max(1, Math.ceil((freeAt - Date.now()) / 1000));
}

/** Durable send throttle: 20 OTP emails per address per hour. */
export async function isOtpSendBudgetExhausted(email: string): Promise<boolean> {
    return (await getOtpSendBudgetWaitSeconds(email)) > 0;
}

/** Durable guessing throttle: 20 failed OTP checks per address per day. */
export async function isOtpAttemptBudgetExhausted(email: string): Promise<boolean> {
    const failures = await prisma.loginEvent.count({
        where: {
            email: email.trim().toLowerCase(),
            type: { in: [LoginEventType.OTP_FAILED, LoginEventType.OTP_MAX_ATTEMPTS] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
    });
    return failures >= 20;
}

/** Durable send throttle: no more than 10 reset codes per address per hour.
 *  Counts only actual sends, not failed guesses. */
export async function isResetSendBudgetExhausted(email: string): Promise<boolean> {
    const events = await prisma.loginEvent.count({
        where: {
            email: email.trim().toLowerCase(),
            type: LoginEventType.PASSWORD_RESET,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
            metadata: { path: ['action'], equals: 'forgot_password_requested' },
        },
    });
    return events >= 10;
}

/** Durable guessing throttle for reset codes: 20 failed checks per hour. */
export async function isResetAttemptBudgetExhausted(email: string): Promise<boolean> {
    const failures = await prisma.loginEvent.count({
        where: {
            email: email.trim().toLowerCase(),
            type: LoginEventType.PASSWORD_RESET,
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
            OR: [
                { metadata: { path: ['action'], equals: 'reset_code_failed' } },
                { metadata: { path: ['action'], equals: 'reset_code_exhausted' } },
            ],
        },
    });
    return failures >= 20;
}
