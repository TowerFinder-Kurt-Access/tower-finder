import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';
import { PASSWORD_MAX_AGE_DAYS, passwordAgeDays } from '@/lib/security-policy';

interface SignInUser {
    id: string;
    email: string;
    name: string;
    role: Role;
    sessionVersion: number;
    passwordChangedAt: Date;
}

export const authConfig = {
    providers: [],
    session: {
        strategy: 'jwt',
        maxAge: 7 * 24 * 60 * 60, // inactive sessions expire after 7 days (was 30)
    },
    callbacks: {
        async jwt({ token, user }) {
            // Runs once at sign-in with the user returned by authorize().
            if (user) {
                const signInUser = user as unknown as SignInUser;
                token.id = signInUser.id;
                token.role = signInUser.role;
                token.email = signInUser.email;
                token.name = signInUser.name;
                token.sessionVersion = signInUser.sessionVersion;
                token.mustChangePassword =
                    passwordAgeDays(signInUser.passwordChangedAt) >= PASSWORD_MAX_AGE_DAYS;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as Role;
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.sessionVersion = token.sessionVersion as number;
                session.user.mustChangePassword = token.mustChangePassword as boolean;
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