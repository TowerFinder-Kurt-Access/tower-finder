import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: "https://272efba7d258c972456f6b47961d00a4@o1188065.ingest.us.sentry.io/4510942005100544",
    tracesSampleRate: 1,
    debug: false,
    enabled: process.env.NODE_ENV === 'production',
});
