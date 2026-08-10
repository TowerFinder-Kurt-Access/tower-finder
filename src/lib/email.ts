// Minimal email delivery wrapper. Uses Resend when RESEND_API_KEY is set;
// otherwise the message is logged to the console so local dev can read the
// OTP from the server log (never from the browser).

export interface SignInCodeEmailOptions {
    code: string;
    expiresInMinutes: number;
    expiresAt: Date;
}

/** Branded sign-in-code email. Inline styles only (email clients strip
 *  <style> blocks). Footer year is dynamic. */
export function signInCodeEmailHtml({ code, expiresInMinutes, expiresAt }: SignInCodeEmailOptions): string {
    const year = new Date().getFullYear();
    const expiryTime = expiresAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    });
    return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f5f8;padding:24px 16px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8ef">
    <div style="background:#0f2a43;padding:20px 28px">
      <span style="color:#ffffff;font-size:18px;font-weight:700">Cell Waves <span style="color:#7cc4f0">|</span> Tower Finder</span>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 4px;font-size:17px;color:#0f2a43;font-weight:700">Your sign-in code</p>
      <p style="margin:0 0 18px;font-size:13px;color:#5b6b7c;line-height:1.5">Use this code to finish signing in to Cell Waves | Tower Finder. It's single-use — a fresh code replaces it each time you ask for one.</p>
      <div style="background:#f1f6fb;border:1px dashed #9db4c8;border-radius:8px;padding:14px;text-align:center;margin-bottom:18px">
        <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0f2a43;font-family:Menlo,Consolas,monospace">${code}</span>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#0f2a43;line-height:1.5"><strong>This code expires in ${expiresInMinutes} minutes</strong> — by ${expiryTime}. Enter it before then.</p>
      <p style="margin:0;font-size:12px;color:#5b6b7c;line-height:1.5">If you didn't request this code, you can safely ignore this email.</p>
    </div>
    <div style="border-top:1px solid #e2e8ef;padding:16px 28px;background:#fafbfc">
      <p style="margin:0;font-size:12px;color:#0f2a43;font-weight:700;letter-spacing:0.3px">Cell Waves | Tower Finder</p>
      <p style="margin:6px 0 0;font-size:11px;color:#8a97a5">© ${year} | All rights reserved</p>
    </div>
  </div>
</div>`;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    // Local dev: always log the message so the OTP can be read from the
    // server log (the test mailboxes don't exist). Production stays silent.
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[dev-email] TO=${to}\nSUBJECT=${subject}\n${html}`);
    }
    if (!apiKey) return;
    const from =
        process.env.EMAIL_FROM ?? 'Tower Finder <no-reply@towerfinder.com>';
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to,
            subject,
            html,
        }),
    });
    if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        // Dev: an unverified Resend domain (403) must not block the OTP flow —
        // the code is already in the [dev-email] log. Production stays strict.
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[dev-email] Resend delivery failed (${res.status}): ${detail} — using console fallback`);
            return;
        }
        throw new Error(`Resend ${res.status}: ${detail}`);
    }
}