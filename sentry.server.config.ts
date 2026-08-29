import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: "https://272efba7d258c972456f6b47961d00a4@o1188065.ingest.us.sentry.io/4510942005100544",
    tracesSampleRate: 0.1,
    debug: false,
    enabled: process.env.NODE_ENV === 'production',
    beforeSend(event) {
        const scrub = (s: string) => s.replace(/(REPORTALL_API_KEY|RESEND_API_KEY|CRON_SECRET|NEXTAUTH_SECRET|GEOAPIFY_API_KEY|WHITEPAGES_API_KEY|NUMVERIFY_API_KEY)/gi, '[REDACTED]').replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]').replace(/\b\d{6}\b/g, '[OTP]');
        if (event.message) event.message = scrub(event.message);
        if (event.breadcrumbs) for (const b of event.breadcrumbs) if (b.message) b.message = scrub(b.message as string);
        return event;
    },
});
