import { prisma } from '@/lib/prisma';
import { LoginEventType } from '@prisma/client';
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

/** Best-effort client IP from request headers (Vercel sets x-forwarded-for). */
export function requestIp(request: Request | null | undefined): string | null {
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
            email: event.email,
            userId: event.userId ?? null,
            type: event.type,
            ip: event.ip ?? null,
            userAgent: event.userAgent ?? null,
            metadata: event.metadata ?? undefined,
        },
    });
}

/** True when the email has >= MAX_FAILED_ATTEMPTS failures within LOCKOUT_WINDOW_MS. */
export async function isLockedOut(email: string): Promise<boolean> {
    const recentFailures = await prisma.loginEvent.count({
        where: {
            email,
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
            email,
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
