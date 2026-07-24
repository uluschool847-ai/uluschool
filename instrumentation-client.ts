import * as Sentry from "@sentry/nextjs";

import {
  parseSentrySampleRate,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
} from "@/lib/monitoring/sentry-sanitize";

const sentryDsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryDsn.length > 0,
  tracesSampleRate: parseSentrySampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? ""),
  beforeSend: sanitizeSentryEvent,
  beforeSendTransaction: sanitizeSentryEvent,
  beforeBreadcrumb: sanitizeSentryBreadcrumb,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
