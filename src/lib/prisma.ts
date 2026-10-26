import { PrismaClient } from '@prisma/client';

// The datasource is a plain postgres:// URL (POSTGRES_URL), not prisma+postgres://,
// so withAccelerate() has nothing to proxy and drops connections with P1017.
const prismaClientSingleton = () => {
    const raw = process.env.POSTGRES_URL;
    let url = raw;
    if (raw) {
        // Prisma's default pool is 2 × CPU + 1, which alone can exceed the
        // direct Prisma Postgres role's connection cap and fail every query
        // with P2037. The role caps at 45 and a dev run that dies without
        // closing its pool left 41 idle sessions behind, so keep this cap.
        // The role also carries idle_session_timeout=600000 set DB-side.
        const parsed = new URL(raw);
        if (!parsed.searchParams.has('connection_limit')) {
            parsed.searchParams.set('connection_limit', '5');
        }
        if (!parsed.searchParams.has('pool_timeout')) {
            parsed.searchParams.set('pool_timeout', '20');
        }
        url = parsed.toString();
    }

    return new PrismaClient({
        log: ['error', 'warn'],
        datasources: { db: { url } },
    });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

// SAFETY: Node keeps one globalThis across dev-mode module reloads, so the client
// survives HMR without reopening a connection pool per rebuild.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
