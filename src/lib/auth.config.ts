
import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';

export const authConfig = {
    providers: [],
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        async jwt({ token, user }) {
            // Initial sign in
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.email = user.email;
                token.name = user.name;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as Role;
                session.user.email = token.email as string;
                session.user.name = token.name as string;
            }
            return session;
        },
    },
    pages: {
        signIn: '/login',
        error: '/login',
    },
    // Trust Vercel's host header to prevent "UnknownAction" errors
    trustHost: true,
    // Check both standard variable names for robustness
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
