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

export type OtpPurpose = 'login' | 'email-change';

function otpKey(email: string, purpose: OtpPurpose): string {
    return purpose === 'email-change'
        ? `${email.trim().toLowerCase()}#email-change`
        : email;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** 8-digit code — crypto-random, not Math.random. */
export function generateOtp(): string {
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

/** Creates (or rotates) the OTP for an email. Enforces the 60s resend
 *  cooldown; returns the plaintext code only so the caller can email it. */
export async function issueLoginOtp(email: string, purpose: OtpPurpose = 'login'): Promise<OtpIssueResult> {
    const key = otpKey(email, purpose);
    const existing = await prisma.loginOtp.findUnique({ where: { email: key } });
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
        where: { email: key },
        create: {
            email: key,
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

    const isEmailChange = purpose === 'email-change';
    const deliveryResult = await sendEmail(
        email,
        isEmailChange ? 'Confirm your Tower Finder email change' : 'Your Tower Finder sign-in code',
        signInCodeEmailHtml({
            code,
            expiresInMinutes: OTP_TTL_MS / 60_000,
            expiresAt,
            heading: isEmailChange ? 'Confirm your email change' : undefined,
            intro: isEmailChange
                ? "Use this code to confirm the email change on your Cell Waves | Tower Finder account. It's single-use — a fresh code replaces it each time you ask for one."
                : undefined,
            preheader: isEmailChange
                ? `Use this code to confirm your email change — it expires in ${OTP_TTL_MS / 60_000} minutes.`
                : undefined,
        }),
        {
            code,
            expiresInMinutes: String(OTP_TTL_MS / 60_000),
            expiryTime: formatExpiryTime(expiresAt),
            year: String(new Date().getFullYear()),
        },
        isEmailChange ? { forceInline: true } : undefined,
    );
    return { code, cooldownRemainingSeconds: 0, deliveryResult };
}

/** Verifies a code, constant-time. Consumes attempts; on success the row is
 *  deleted so a code can never be reused. */
export async function verifyLoginOtp(email: string, code: string, purpose: OtpPurpose = 'login'): Promise<OtpVerifyResult> {
    const key = otpKey(email, purpose);
    const row = await prisma.loginOtp.findUnique({ where: { email: key } });
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.expiresAt.getTime() < Date.now()) {
        // Keep the row so the resend cooldown still applies.
        return { ok: false, reason: 'expired' };
    }

    // Claim one attempt atomically before comparing. A burst of guesses can
    // no longer all read attempts=0 and slip past the limit.
    const claimed = await prisma.loginOtp.updateMany({
        where: { email: key, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
        const stillExists = await prisma.loginOtp.findUnique({ where: { email: key } });
        if (!stillExists) return { ok: false, reason: 'not_found' };
        return { ok: false, reason: 'max_attempts' };
    }

    const provided = Buffer.from(sha256(code), 'hex');
    const stored = Buffer.from(row.otpHash, 'hex');
    const valid = provided.length === stored.length && timingSafeEqual(provided, stored);

    if (valid) {
        await prisma.loginOtp.delete({ where: { email: key } });
        return { ok: true };
    }

    return { ok: false, reason: 'invalid' };
}