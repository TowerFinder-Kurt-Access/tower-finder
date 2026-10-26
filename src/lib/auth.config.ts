import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';
import { passwordIsExpired } from '@/lib/security-policy';

interface SignInUser {
    id: string;
    email: string;
    name: string;
    role: Role;
    sessionVersion: number;
    passwordChangedAt: Date;
    mustChangePassword: boolean;
    passwordPolicyOutdated: boolean;
    twoFactorEnabled: boolean;
}

export const authConfig = {
    providers: [],
    session: {
        strategy: 'jwt',
        maxAge: 7 * 24 * 60 * 60, // inactive sessions expire after 7 days (was 30)
    },
    callbacks: {
        async jwt({ token, user, trigger, session }) {
            // Runs once at sign-in with the user returned by authorize().
            if (user) {
                const signInUser = user as unknown as SignInUser;
                token.id = signInUser.id;
                token.role = signInUser.role;
                token.email = signInUser.email;
                token.name = signInUser.name;
                        token.sessionVersion = signInUser.sessionVersion;
                        token.mustChangePassword = passwordIsExpired(signInUser.passwordChangedAt);
                        token.forcedPasswordChange = signInUser.mustChangePassword;
                        token.passwordPolicyOutdated = signInUser.passwordPolicyOutdated;
                        token.twoFactorEnabled = signInUser.twoFactorEnabled;
            }
            // Display-name refresh only. Identity fields stay sign-in owned;
            // email changes revoke the session instead of mutating the token.
            if (trigger === 'update') {
                const nextName = (session as { user?: { name?: string } } | undefined)?.user?.name;
                if (typeof nextName === 'string' && nextName.trim()) {
                    token.name = nextName.trim();
                }
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
                        session.user.forcedPasswordChange = token.forcedPasswordChange as boolean;
                        session.user.passwordPolicyOutdated = token.passwordPolicyOutdated as boolean;
                        session.user.twoFactorEnabled = token.twoFactorEnabled as boolean;
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
    secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;