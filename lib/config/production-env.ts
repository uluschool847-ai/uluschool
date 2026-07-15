import { z } from "zod";

export type DeploymentEnvironment = "staging" | "production";

export type EnvironmentValidationResult =
  | { ok: true; skipped: boolean; appEnv?: DeploymentEnvironment }
  | { ok: false; errors: Array<{ key: string; message: string }> };

const PRODUCTION_ORIGIN = "https://uluglobalacademy.com";
const MIN_SECRET_LENGTH = 32;
const R2_ENDPOINT_PATTERN =
  /^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/;
const R2_BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/;
const emailSchema = z.string().email();

const productionEnvironmentSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    APP_ENV: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    DIRECT_URL: z.string().optional(),
    AUTH_SESSION_SECRET: z.string().optional(),
    ADMIN_REQUIRE_2FA: z.string().optional(),
    GOOGLE_TIMEZONE: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().optional(),
    TURNSTILE_ENFORCE: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SCHOOL_INBOX_EMAIL: z.string().optional(),
    STORAGE_DRIVER: z.string().optional(),
    R2_ENDPOINT: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    PRIVACY_CONTACT_EMAIL: z.string().optional(),
    PRIVACY_EMAIL_PROCESSOR_NAME: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    REMINDER_CRON_TOKEN: z.string().optional(),
    ALERT_WEBHOOK_URL: z.string().optional(),
    ALERT_TEST_TOKEN: z.string().optional(),
    SENTRY_ENABLED: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    DEFAULT_PORTAL_PASSWORD: z.string().optional(),
  })
  .passthrough()
  .superRefine((env, context) => {
    const appEnv = env.APP_ENV;

    if (!appEnv?.trim()) {
      addIssue(context, "APP_ENV", "is required when RENDER is true");
    } else if (appEnv !== "staging" && appEnv !== "production") {
      addIssue(context, "APP_ENV", "must equal staging or production");
    }

    requireLiteral(context, env.NODE_ENV, "NODE_ENV", "production");
    requireDatabaseUrl(context, env.DATABASE_URL, "DATABASE_URL");
    requireDatabaseUrl(context, env.DIRECT_URL, "DIRECT_URL");
    requireSecret(context, env.AUTH_SESSION_SECRET, "AUTH_SESSION_SECRET");
    requireLiteral(context, env.ADMIN_REQUIRE_2FA, "ADMIN_REQUIRE_2FA", "true");
    requireLiteral(context, env.GOOGLE_TIMEZONE, "GOOGLE_TIMEZONE", "Africa/Nairobi");
    requireSiteOrigin(context, env.NEXT_PUBLIC_SITE_URL, appEnv);
    requireLiteral(context, env.TURNSTILE_ENFORCE, "TURNSTILE_ENFORCE", "true");
    requireProviderValue(
      context,
      env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    );
    requireProviderValue(context, env.TURNSTILE_SECRET_KEY, "TURNSTILE_SECRET_KEY");
    requireSmtpHost(context, env.SMTP_HOST);
    requireSmtpPort(context, env.SMTP_PORT);
    requireProviderValue(context, env.SMTP_USER, "SMTP_USER");
    requireProviderValue(context, env.SMTP_PASS, "SMTP_PASS");
    requireMailbox(context, env.SMTP_FROM, "SMTP_FROM", true);
    requireMailbox(context, env.SCHOOL_INBOX_EMAIL, "SCHOOL_INBOX_EMAIL");
    requireLiteral(context, env.STORAGE_DRIVER, "STORAGE_DRIVER", "r2");
    requireR2Endpoint(context, env.R2_ENDPOINT);
    requireProviderValue(context, env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID");
    requireProviderValue(context, env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY");
    requireR2Bucket(context, env.R2_BUCKET_NAME);
    requireMailbox(context, env.PRIVACY_CONTACT_EMAIL, "PRIVACY_CONTACT_EMAIL");
    requireProviderValue(context, env.PRIVACY_EMAIL_PROCESSOR_NAME, "PRIVACY_EMAIL_PROCESSOR_NAME");
    requireSecret(context, env.CRON_SECRET, "CRON_SECRET");
    requireSecret(context, env.REMINDER_CRON_TOKEN, "REMINDER_CRON_TOKEN");
    requireHttpsUrl(context, env.ALERT_WEBHOOK_URL, "ALERT_WEBHOOK_URL");
    requireSecret(context, env.ALERT_TEST_TOKEN, "ALERT_TEST_TOKEN");
    requireSentryContract(context, env);

    if (env.DEFAULT_PORTAL_PASSWORD?.trim()) {
      addIssue(context, "DEFAULT_PORTAL_PASSWORD", "must be empty in production-like environments");
    }
  });

function addIssue(context: z.RefinementCtx, key: string, message: string) {
  context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
}

function requireLiteral(
  context: z.RefinementCtx,
  value: string | undefined,
  key: string,
  expected: string,
) {
  if (value !== expected) addIssue(context, key, `must equal ${expected}`);
}

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    /placeholder|\btodo\b|\btbd\b/.test(normalized) ||
    /^change(?:[-_ ]?this|[-_ ]?me)/.test(normalized) ||
    /^replace(?:[-_ ]?this|[-_ ]?me)/.test(normalized) ||
    /^(?:your|example)[-_ ]/.test(normalized) ||
    /^(?:dummy|sample|fake)(?:$|[-_ ])/.test(normalized) ||
    /^(?:ci|test|dev|local)[-_ ]only/.test(normalized) ||
    /^(?:secret|password|token)$/.test(normalized) ||
    /^<.*>$/.test(normalized) ||
    /^(.)\1+$/.test(normalized)
  );
}

function requireProviderValue(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (!value?.trim() || isPlaceholder(value)) {
    addIssue(context, key, "must be configured and must not be a placeholder");
  }
}

function requireSecret(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (!value || value.trim().length < MIN_SECRET_LENGTH || isPlaceholder(value)) {
    addIssue(context, key, "must contain at least 32 characters and must not be a placeholder");
  }
}

function requireDatabaseUrl(context: z.RefinementCtx, value: string | undefined, key: string) {
  try {
    const parsed = new URL(value ?? "");
    if (!parsed.hostname || !["postgresql:", "postgres:"].includes(parsed.protocol)) throw null;
  } catch {
    addIssue(context, key, "must use the PostgreSQL URL scheme");
  }
}

function requireSiteOrigin(
  context: z.RefinementCtx,
  value: string | undefined,
  appEnv: string | undefined,
) {
  if (appEnv === "production") {
    if (value !== PRODUCTION_ORIGIN) {
      addIssue(context, "NEXT_PUBLIC_SITE_URL", "must equal the canonical production origin");
    }
    return;
  }

  if (appEnv !== "staging") return;

  try {
    const parsed = new URL(value ?? "");
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.origin !== value ||
      value === PRODUCTION_ORIGIN
    ) {
      throw null;
    }
  } catch {
    addIssue(context, "NEXT_PUBLIC_SITE_URL", "must be a different HTTPS origin for staging");
  }
}

function requireSmtpHost(context: z.RefinementCtx, value: string | undefined) {
  const host = value?.trim() ?? "";
  if (!host || /\s|:\/\/|[/@]/.test(host)) {
    addIssue(context, "SMTP_HOST", "must be a hostname");
  }
}

function requireSmtpPort(context: z.RefinementCtx, value: string | undefined) {
  const port = Number(value);
  if (!value || !/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    addIssue(context, "SMTP_PORT", "must be an integer from 1 through 65535");
  }
}

function requireMailbox(
  context: z.RefinementCtx,
  value: string | undefined,
  key: string,
  allowDisplayName = false,
) {
  const candidate = value?.trim() ?? "";
  const displayNameMatch = allowDisplayName ? candidate.match(/^[^<>\r\n]+<([^<>\s]+)>$/) : null;
  const address = displayNameMatch?.[1] ?? candidate;
  if (!emailSchema.safeParse(address).success) {
    addIssue(context, key, "must be a valid email address");
  }
}

function requireR2Endpoint(context: z.RefinementCtx, value: string | undefined) {
  const endpoint = value?.trim() ?? "";
  try {
    const parsed = new URL(endpoint);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/" ||
      !R2_ENDPOINT_PATTERN.test(endpoint)
    ) {
      throw null;
    }
  } catch {
    addIssue(context, "R2_ENDPOINT", "must use the approved R2 account endpoint format");
  }
}

function requireR2Bucket(context: z.RefinementCtx, value: string | undefined) {
  const bucket = value?.trim() ?? "";
  if (bucket.length < 3 || bucket.length > 63 || !R2_BUCKET_PATTERN.test(bucket)) {
    addIssue(context, "R2_BUCKET_NAME", "must use the approved R2 bucket name format");
  }
}

function isHttpsUrl(value: string | undefined, allowUsername = false) {
  try {
    const parsed = new URL(value ?? "");
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.password &&
      (allowUsername || !parsed.username)
    );
  } catch {
    return false;
  }
}

function requireHttpsUrl(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (!isHttpsUrl(value)) {
    addIssue(context, key, "must be an HTTPS URL without embedded credentials");
  }
}

function requireSentryContract(
  context: z.RefinementCtx,
  env: {
    SENTRY_ENABLED?: string;
    SENTRY_DSN?: string;
    NEXT_PUBLIC_SENTRY_DSN?: string;
  },
) {
  if (env.SENTRY_ENABLED !== "true" && env.SENTRY_ENABLED !== "false") {
    addIssue(context, "SENTRY_ENABLED", "must equal true or false");
    return;
  }

  for (const key of ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"] as const) {
    const value = env[key];
    if (env.SENTRY_ENABLED === "true") {
      if (!isHttpsUrl(value, true)) {
        addIssue(context, key, "must be an HTTPS DSN when Sentry is enabled");
      }
    } else if (value !== undefined && value !== "") {
      addIssue(context, key, "must be empty when Sentry is disabled");
    }
  }
}

export function validateProductionEnv(
  env: Readonly<Record<string, string | undefined>>,
): EnvironmentValidationResult {
  const appEnv = env.APP_ENV;
  const isRender = env.RENDER === "true";

  if (!isRender && !appEnv?.trim()) return { ok: true, skipped: true };

  const parsed = productionEnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    const seen = new Set<string>();
    const errors = parsed.error.issues.flatMap((issue) => {
      const key = typeof issue.path[0] === "string" ? issue.path[0] : "ENVIRONMENT";
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, message: issue.message }];
    });
    return { ok: false, errors };
  }

  return {
    ok: true,
    skipped: false,
    appEnv: appEnv as DeploymentEnvironment,
  };
}
