import * as Sentry from "@sentry/nextjs";

import {
  parseSentrySampleRate,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
} from "@/lib/monitoring/sentry-sanitize";

const sentryDsn = (process.env.SENTRY_DSN ?? "").trim();
const sentryEnabled = (process.env.SENTRY_ENABLED ?? "false") === "true";

Sentry.init({
  dsn: sentryDsn,
  enabled: sentryEnabled && sentryDsn.length > 0,
  tracesSampleRate: parseSentrySampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE ?? ""),
  beforeSend: sanitizeSentryEvent,
  beforeBreadcrumb: sanitizeSentryBreadcrumb,
  sendDefaultPii: false,
});
