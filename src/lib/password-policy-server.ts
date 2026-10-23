import { prisma } from '@/lib/prisma';
import { CURRENT_PASSWORD_POLICY_VERSION } from '@/lib/password-policy';

/**
 * Records that this user now holds a password written under the current rules.
 * Called from every route that sets a password, so the sign-in check stops
 * nudging the account.
 */
export async function markPasswordPolicyCurrent(userId: number): Promise<void> {
    await prisma.userPasswordPolicy.upsert({
        where: { userId },
        create: { userId, policyVersion: CURRENT_PASSWORD_POLICY_VERSION },
        update: { policyVersion: CURRENT_PASSWORD_POLICY_VERSION },
    });
}
