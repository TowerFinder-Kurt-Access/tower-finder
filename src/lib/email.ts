// Minimal email delivery wrapper. Uses Resend when RESEND_API_KEY is set;
// otherwise the message is logged to the console so local dev can read the
// OTP from the server log (never from the browser).
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