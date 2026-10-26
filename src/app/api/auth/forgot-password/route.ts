import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, randomInt } from 'crypto';
import { sendEmail } from '@/lib/email';
import { isIpRateLimited, isResetAttemptBudgetExhausted, isResetSendBudgetExhausted, recordLoginEvent, requestIp } from '@/lib/login-security';
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends
const CODE_MAX_ATTEMPTS = 5;

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function generateCode(): string {
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

function resetCodeEmailHtml(code: string): string {
    const year = new Date().getFullYear();
    return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f5f8;padding:24px 16px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8ef">
    <div style="background:#0f2a43;padding:20px 28px">
      <span style="color:#ffffff;font-size:18px;font-weight:700">Cell Waves <span style="color:#7cc4f0">|</span> Tower Finder</span>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 4px;font-size:17px;color:#0f2a43;font-weight:700">Reset your password</p>
      <p style="margin:0 0 18px;font-size:13px;color:#5b6b7c;line-height:1.5">Use this code to reset your Tower Finder password. Enter it along with your new password on the login screen.</p>
      <div style="background:#f1f6fb;border:1px dashed #9db4c8;border-radius:8px;padding:14px;text-align:center;margin-bottom:18px">
        <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0f2a43;font-family:Menlo,Consolas,monospace">${code}</span>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#0f2a43;line-height:1.5"><strong>This code expires in 10 minutes.</strong> Enter it before then.</p>
      <p style="margin:0;font-size:12px;color:#5b6b7c;line-height:1.5">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <div style="border-top:1px solid #e2e8ef;padding:16px 28px;background:#fafbfc">
      <p style="margin:0;font-size:12px;color:#0f2a43;font-weight:700;letter-spacing:0.3px">Cell Waves | Tower Finder</p>
      <p style="margin:4px 0 0;font-size:11px"><a href="https://tower-finder.vercel.app/" style="color:#2b6cb0;text-decoration:none">tower-finder.vercel.app</a></p>
      <p style="margin:6px 0 0;font-size:11px;color:#8a97a5">&copy; ${year} | All rights reserved</p>
    </div>
  </div>
</div>`;
}

// POST /api/auth/forgot-password — { email }
// Always returns 200 with the same message to prevent email enumeration.
export async function POST(request: Request) {
    try {
        // IP rate limit: 5/min — prevents enumeration / quota burn
        const ip = requestIp(request);
        if (isIpRateLimited(ip, 5, 60_000)) {
            return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
        }
        let body: { email?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        const email = body.email?.trim().toLowerCase();
        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const successResponse = NextResponse.json({
            message: 'If an account with that email exists, you will receive a reset code shortly.',
        });

        // Durable per-address budget: stops code-email floods and long
        // guessing campaigns even when the IP limiter is bypassed.
        if (await isResetSendBudgetExhausted(email) || await isResetAttemptBudgetExhausted(email)) {
            return successResponse;
        }

        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
        if (!user || !user.isActive) {
            return successResponse;
        }

        // Enforce resend cooldown: if a recent code was sent, don't send another.
        const existing = await prisma.passwordResetToken.findFirst({
            where: { email },
            orderBy: { createdAt: 'desc' },
        });
        if (existing) {
            const cooldown = CODE_RESEND_COOLDOWN_MS - (Date.now() - existing.createdAt.getTime());
            if (cooldown > 0) {
                // Same body as every other outcome: no account-existence oracle.
                return successResponse;
            }
        }

        // Invalidate any previous reset codes for this email.
        await prisma.passwordResetToken.deleteMany({ where: { email } }).catch(() => {});

        // Generate an 8-digit code and store only the hash.
        const code = generateCode();
        const codeHash = sha256(code);
        const expiresAt = new Date(Date.now() + CODE_TTL_MS);

        await prisma.passwordResetToken.create({
            data: { email, codeHash, expiresAt },
        });

        // Record the send request before responding so the durable budget sees
        // it, then deliver the email after the response.
        const userAgent = request.headers.get('user-agent');
        const requestEvent = await recordLoginEvent({
            email,
            userId: user.id,
            type: 'PASSWORD_RESET',
            ip,
            userAgent,
            metadata: { action: 'forgot_password_requested' },
        }).catch(() => null);

        after(async () => {
            // Inline HTML so the actual 8-digit code renders in the body.
            const delivery = await sendEmail(
                email,
                'Your Tower Finder password reset code',
                resetCodeEmailHtml(code),
                undefined,
                { forceInline: true },
            );
            if (requestEvent) {
                await prisma.loginEvent.update({
                    where: { id: requestEvent.id },
                    data: {
                        metadata: {
                            action: 'forgot_password_requested',
                            resendStatus: delivery.resendStatus,
                            resendId: delivery.resendId,
                            resendError: delivery.resendError,
                            devFallback: delivery.devFallback ?? false,
                        },
                    },
                }).catch(() => {});
            }
        });

        return successResponse;
    } catch (err) {
        console.error('[forgot-password] POST failed:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
