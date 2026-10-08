import { PrismaClient } from '@prisma/client';

// The datasource is a plain postgres:// URL (POSTGRES_URL), not prisma+postgres://,
// so withAccelerate() has nothing to proxy and drops connections with P1017.
const prismaClientSingleton = () => {
    return new PrismaClient({
        log: ['error', 'warn'],
        datasources: { db: { url: process.env.POSTGRES_URL } },
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
