import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail, signInCodeEmailHtml, formatExpiryTime, type EmailDeliveryResult } from '@/lib/email';

export const OTP_TTL_MS = 5 * 60 * 1000; // code valid for 5 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // one code per minute
export const OTP_MAX_ATTEMPTS = 3;

export interface OtpIssueResult {
    code: string; // plaintext, only passed to sendEmail() — never stored
    cooldownRemainingSeconds: number;
    /** Delivery result from the email provider (Resend). null when cooldown preempts send. */
    deliveryResult: EmailDeliveryResult | null;
}

export type OtpVerifyResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' | 'expired' | 'max_attempts' | 'invalid' };

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** 6-digit code — crypto-random, not Math.random. */
export function generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Creates (or rotates) the OTP for an email. Enforces the 60s resend
 *  cooldown; returns the plaintext code only so the caller can email it. */
export async function issueLoginOtp(email: string): Promise<OtpIssueResult> {
    const existing = await prisma.loginOtp.findUnique({ where: { email } });
    if (existing) {
        const cooldown = OTP_RESEND_COOLDOWN_MS - (Date.now() - existing.createdAt.getTime());
        if (cooldown > 0) {
            return { code: '', cooldownRemainingSeconds: Math.ceil(cooldown / 1000), deliveryResult: null };
        }
    }

    const code = generateOtp();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    await prisma.loginOtp.upsert({
        where: { email },
        create: {
            email,
            otpHash: sha256(code),
            expiresAt,
            createdAt: now,
        },
        update: {
            otpHash: sha256(code),
            expiresAt,
            attempts: 0,
            createdAt: now,
        },
    });

    const deliveryResult = await sendEmail(
        email,
        'Your Tower Finder sign-in code',
        signInCodeEmailHtml({
            code,
            expiresInMinutes: OTP_TTL_MS / 60_000,
            expiresAt,
        }),
        {
            code,
            expiresInMinutes: String(OTP_TTL_MS / 60_000),
            expiryTime: formatExpiryTime(expiresAt),
            year: String(new Date().getFullYear()),
        }
    );
    return { code, cooldownRemainingSeconds: 0, deliveryResult };
}

/** Verifies a code, constant-time. Consumes attempts; on success the row is
 *  deleted so a code can never be reused. */
export async function verifyLoginOtp(email: string, code: string): Promise<OtpVerifyResult> {
    const row = await prisma.loginOtp.findUnique({ where: { email } });
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.expiresAt.getTime() < Date.now()) {
        await prisma.loginOtp.delete({ where: { email } });
        return { ok: false, reason: 'expired' };
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
        await prisma.loginOtp.delete({ where: { email } });
        return { ok: false, reason: 'max_attempts' };
    }

    const provided = Buffer.from(sha256(code), 'hex');
    const stored = Buffer.from(row.otpHash, 'hex');
    const valid = provided.length === stored.length && timingSafeEqual(provided, stored);

    if (valid) {
        await prisma.loginOtp.delete({ where: { email } });
        return { ok: true };
    }

    await prisma.loginOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: 'invalid' };
}