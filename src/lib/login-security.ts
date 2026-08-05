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
}

/** Best-effort client IP from request headers (Vercel sets x-forwarded-for). */
export function requestIp(request: Request | null | undefined): string | null {
    const fwd = request?.headers.get('x-forwarded-for');
    return fwd ? fwd.split(',')[0].trim() : null;
}

export function recordLoginEvent(event: LoginEventInput) {
    return prisma.loginEvent.create({
        data: {
            email: event.email,
            userId: event.userId ?? null,
            type: event.type,
            ip: event.ip ?? null,
            userAgent: event.userAgent ?? null,
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
