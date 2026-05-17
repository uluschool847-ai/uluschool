import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

Sentry.init({
  dsn: sentryDsn,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  enabled: Boolean(sentryDsn),
});
