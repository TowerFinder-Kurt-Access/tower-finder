import { Prisma } from '@prisma/client';

const RETRYABLE: Record<string, true> = {
    P1001: true,
    P1002: true,
    P1017: true,
    P2024: true,
    P2037: true,
};
const DELAYS_MS = [300, 900, 1800];

/**
 * Retry read-only database work through transient connection failures.
 * A database blip should not blank the map with a 500.
 */
export async function withDbRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await run();
        } catch (error) {
            const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
            if (!code || !RETRYABLE[code] || attempt >= DELAYS_MS.length) throw error;
            const { promise, resolve } = Promise.withResolvers<void>();
            setTimeout(resolve, DELAYS_MS[attempt]);
            await promise;
        }
    }
}
