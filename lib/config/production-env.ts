import { z } from "zod";

import { parseEmailSender, parseSingleMailbox } from "@/lib/security/escape-html";

export type DeploymentEnvironment = "staging" | "production";

export type EnvironmentValidationResult =
  | { ok: true; skipped: boolean; appEnv?: DeploymentEnvironment }
  | { ok: false; errors: Array<{ key: string; message: string }> };

const PRODUCTION_ORIGIN = "https://uluglobalacademy.com";
const MIN_SECRET_LENGTH = 32;
const MAX_PLACEHOLDER_ANALYSIS_LENGTH = 4096;
const MIN_RESIDUAL_ENTROPY_LENGTH = 12;
const R2_ENDPOINT_PATTERN =
  /^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/;
const R2_BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/;
const RESERVED_MONITORING_HOST_SUFFIXES = ["invalid", "example", "test"] as const;
const RESERVED_PUBLIC_CONTACT_DOMAINS = ["example.com", "example.net", "example.org"] as const;
const KNOWN_SYNTHETIC_CONTACT_NUMBERS = new Set(["+1234567890", "+9876543210"]);
const EXTENDED_PLACEHOLDER_PREFIXES = ["dummy", "example", "placeholder"] as const;
const CHANGE_PLACEHOLDER_PREFIXES = [
  "changethis",
  "changeme",
  "replacethis",
  "replaceme",
  "pleasechangethis",
  "pleasechangeme",
  "pleasereplacethis",
  "pleasereplaceme",
] as const;
const REPEATED_PLACEHOLDER_WORDS = ["password", "secret", "token"] as const;
const RESERVED_PLACEHOLDER_WORDS = [
  "access",
  "admin",
  "alert",
  "api",
  "app",
  "auth",
  "authentication",
  "be",
  "before",
  "change",
  "changed",
  "changeme",
  "changethis",
  "credential",
  "credentials",
  "cron",
  "default",
  "deploy",
  "deployment",
  "dev",
  "dummy",
  "environment",
  "example",
  "fake",
  "for",
  "job",
  "key",
  "local",
  "me",
  "must",
  "only",
  "password",
  "placeholder",
  "please",
  "production",
  "reminder",
  "replace",
  "replaced",
  "replacement",
  "replaceme",
  "replacethis",
  "sample",
  "secret",
  "session",
  "staging",
  "temp",
  "temporary",
  "test",
  "that",
  "the",
  "this",
  "to",
  "token",
  "value",
  "with",
  "your",
] as const;
const CREDENTIAL_RISK_WORDS = new Set([
  "auth",
  "authentication",
  "changeme",
  "changethis",
  "credential",
  "credentials",
  "dummy",
  "example",
  "fake",
  "key",
  "password",
  "placeholder",
  "replaceme",
  "replacethis",
  "sample",
  "secret",
  "token",
]);
const UNREACHABLE_RESIDUAL_LENGTH = 0xffff;

const productionEnvironmentSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    APP_ENV: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    DIRECT_URL: z.string().optional(),
    AUTH_SESSION_SECRET: z.string().optional(),
    ADMIN_SSO_ENABLED: z.string().optional(),
    ADMIN_SSO_LOGIN_URL: z.string().optional(),
    ADMIN_SSO_SHARED_SECRET: z.string().optional(),
    GOOGLE_TIMEZONE: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().optional(),
    NEXT_PUBLIC_CONTACT_EMAIL: z.string().optional(),
    NEXT_PUBLIC_CONTACT_PHONE: z.string().optional(),
    NEXT_PUBLIC_CONTACT_WHATSAPP: z.string().optional(),
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
    SEED_PORTAL_PASSWORD: z.string().optional(),
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
    requireLiteral(context, env.ADMIN_SSO_ENABLED, "ADMIN_SSO_ENABLED", "false");
    requireEmpty(context, env.ADMIN_SSO_LOGIN_URL, "ADMIN_SSO_LOGIN_URL");
    requireEmpty(context, env.ADMIN_SSO_SHARED_SECRET, "ADMIN_SSO_SHARED_SECRET");
    requireLiteral(context, env.GOOGLE_TIMEZONE, "GOOGLE_TIMEZONE", "Africa/Nairobi");
    requireSiteOrigin(context, env.NEXT_PUBLIC_SITE_URL, appEnv);
    if (appEnv === "production") {
      requirePublicContactEmail(
        context,
        env.NEXT_PUBLIC_CONTACT_EMAIL,
        "NEXT_PUBLIC_CONTACT_EMAIL",
      );
      requireOptionalContactNumber(
        context,
        env.NEXT_PUBLIC_CONTACT_PHONE,
        "NEXT_PUBLIC_CONTACT_PHONE",
      );
      requireOptionalContactNumber(
        context,
        env.NEXT_PUBLIC_CONTACT_WHATSAPP,
        "NEXT_PUBLIC_CONTACT_WHATSAPP",
      );
    }
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
    requireEmailSender(context, env.SMTP_FROM);
    requireSingleMailbox(context, env.SCHOOL_INBOX_EMAIL, "SCHOOL_INBOX_EMAIL");
    requireLiteral(context, env.STORAGE_DRIVER, "STORAGE_DRIVER", "r2");
    requireR2Endpoint(context, env.R2_ENDPOINT);
    requireProviderValue(context, env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID");
    requireProviderValue(context, env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY");
    requireR2Bucket(context, env.R2_BUCKET_NAME);
    requireSingleMailbox(context, env.PRIVACY_CONTACT_EMAIL, "PRIVACY_CONTACT_EMAIL");
    requireProviderValue(context, env.PRIVACY_EMAIL_PROCESSOR_NAME, "PRIVACY_EMAIL_PROCESSOR_NAME");
    requireSecret(context, env.CRON_SECRET, "CRON_SECRET");
    requireSecret(context, env.REMINDER_CRON_TOKEN, "REMINDER_CRON_TOKEN");
    requireHttpsUrl(context, env.ALERT_WEBHOOK_URL, "ALERT_WEBHOOK_URL");
    requireSecret(context, env.ALERT_TEST_TOKEN, "ALERT_TEST_TOKEN");
    requireSentryContract(context, env);
    requireEmpty(context, env.SEED_PORTAL_PASSWORD, "SEED_PORTAL_PASSWORD");
    requireEmpty(context, env.DEFAULT_PORTAL_PASSWORD, "DEFAULT_PORTAL_PASSWORD");
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

function requireEmpty(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (value !== undefined && value !== "") addIssue(context, key, "must be empty");
}

function isPlaceholder(
  value: string,
  minimumResidualEntropyLength = 1,
  countDigitsAsEntropy = false,
) {
  if (value.length > MAX_PLACEHOLDER_ANALYSIS_LENGTH) return true;

  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return (
    !normalized ||
    /\b(?:todo|tbd)\b/.test(normalized) ||
    CHANGE_PLACEHOLDER_PREFIXES.some((prefix) => compact.startsWith(prefix)) ||
    EXTENDED_PLACEHOLDER_PREFIXES.some((prefix) => compact.startsWith(prefix)) ||
    REPEATED_PLACEHOLDER_WORDS.some((word) => isRepeatedPlaceholderWord(compact, word)) ||
    /^(?:your)[-_ ]/.test(normalized) ||
    /^(?:sample|fake)(?:$|[-_ ])/.test(normalized) ||
    /^(?:ci|test|dev|local)[-_ ]only/.test(normalized) ||
    /^<.*>$/.test(normalized) ||
    /^(.)\1+$/.test(normalized) ||
    isComposedPlaceholder(compact, minimumResidualEntropyLength, countDigitsAsEntropy)
  );
}

function isComposedPlaceholder(
  value: string,
  minimumResidualEntropyLength: number,
  countDigitsAsEntropy: boolean,
) {
  if (!value) return false;

  const withoutRisk = new Uint16Array(value.length + 1);
  const withRisk = new Uint16Array(value.length + 1);
  withoutRisk.fill(UNREACHABLE_RESIDUAL_LENGTH);
  withRisk.fill(UNREACHABLE_RESIDUAL_LENGTH);
  withoutRisk[0] = 0;

  for (let index = 0; index < value.length; index += 1) {
    const residualWithoutRisk = withoutRisk[index];
    const residualWithRisk = withRisk[index];

    const code = value.charCodeAt(index);
    const residualCost = !countDigitsAsEntropy && code >= 48 && code <= 57 ? 0 : 1;

    if (residualWithoutRisk !== UNREACHABLE_RESIDUAL_LENGTH) {
      withoutRisk[index + 1] = Math.min(withoutRisk[index + 1], residualWithoutRisk + residualCost);
    }
    if (residualWithRisk !== UNREACHABLE_RESIDUAL_LENGTH) {
      withRisk[index + 1] = Math.min(withRisk[index + 1], residualWithRisk + residualCost);
    }

    for (const word of RESERVED_PLACEHOLDER_WORDS) {
      if (!value.startsWith(word, index)) continue;

      const nextIndex = index + word.length;
      if (residualWithoutRisk !== UNREACHABLE_RESIDUAL_LENGTH) {
        if (CREDENTIAL_RISK_WORDS.has(word)) {
          withRisk[nextIndex] = Math.min(withRisk[nextIndex], residualWithoutRisk);
        } else {
          withoutRisk[nextIndex] = Math.min(withoutRisk[nextIndex], residualWithoutRisk);
        }
      }
      if (residualWithRisk !== UNREACHABLE_RESIDUAL_LENGTH) {
        withRisk[nextIndex] = Math.min(withRisk[nextIndex], residualWithRisk);
      }
    }
  }

  return withRisk[value.length] < minimumResidualEntropyLength;
}

function isRepeatedPlaceholderWord(value: string, word: string) {
  let remainder = value;
  let repetitions = 0;
  while (remainder.startsWith(word)) {
    remainder = remainder.slice(word.length);
    repetitions += 1;
  }
  return repetitions >= 2 || (repetitions === 1 && /^\d*$/.test(remainder));
}

function requireProviderValue(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (!value || isPlaceholder(value)) {
    addIssue(context, key, "must be configured and must not be a placeholder");
  }
}

function requireSecret(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (
    !value ||
    isPlaceholder(value, MIN_RESIDUAL_ENTROPY_LENGTH, true) ||
    value.trim().length < MIN_SECRET_LENGTH
  ) {
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
  if (!isCanonicalHttpsOrigin(value)) {
    addIssue(context, "NEXT_PUBLIC_SITE_URL", "must be an HTTPS origin");
    return;
  }

  if (appEnv === "production") {
    if (value !== PRODUCTION_ORIGIN) {
      addIssue(context, "NEXT_PUBLIC_SITE_URL", "must equal the canonical production origin");
    }
    return;
  }

  if (appEnv === "staging" && value === PRODUCTION_ORIGIN) {
    addIssue(context, "NEXT_PUBLIC_SITE_URL", "must be a different HTTPS origin for staging");
  }
}

function isCanonicalHttpsOrigin(value: string | undefined) {
  try {
    const parsed = new URL(value ?? "");
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      parsed.origin === value
    );
  } catch {
    return false;
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

function requireEmailSender(context: z.RefinementCtx, value: string | undefined) {
  if (!parseEmailSender(value)) {
    addIssue(context, "SMTP_FROM", "must be a valid email sender");
  }
}

function requireSingleMailbox(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (!parseSingleMailbox(value)) {
    addIssue(context, key, "must be a valid email address");
  }
}

function requirePublicContactEmail(
  context: z.RefinementCtx,
  value: string | undefined,
  key: string,
) {
  const mailbox = parseSingleMailbox(value);
  const domain = mailbox?.address.split("@").at(-1)?.toLowerCase();
  if (
    !domain ||
    RESERVED_PUBLIC_CONTACT_DOMAINS.some(
      (reservedDomain) => domain === reservedDomain || domain.endsWith(`.${reservedDomain}`),
    ) ||
    RESERVED_MONITORING_HOST_SUFFIXES.some(
      (suffix) => domain === suffix || domain.endsWith(`.${suffix}`),
    )
  ) {
    addIssue(context, key, "must be a valid email address outside reserved domains");
  }
}

function requireOptionalContactNumber(
  context: z.RefinementCtx,
  value: string | undefined,
  key: string,
) {
  const normalized = value?.trim();
  if (!normalized) return;

  const compact = normalized.replace(/[\s().-]/g, "");
  if (
    isPlaceholder(normalized) ||
    !/^\+[1-9]\d{7,14}$/.test(compact) ||
    isSyntheticPhoneNumber(compact)
  ) {
    addIssue(context, key, "must be a valid international phone number when configured");
  }
}

function isSyntheticPhoneNumber(compact: string) {
  const digits = compact.slice(1);
  return (
    /^(\d)\1+$/.test(digits) ||
    /0{7,}$/.test(digits) ||
    KNOWN_SYNTHETIC_CONTACT_NUMBERS.has(compact)
  );
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

function isLoopbackIpv4(hostname: string) {
  const octets = hostname.split(".");
  return octets.length === 4 && octets.every((octet) => /^\d+$/.test(octet)) && octets[0] === "127";
}

function isReservedMonitoringHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  if (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(normalized) ||
    isLoopbackIpv4(normalized)
  ) {
    return true;
  }

  return RESERVED_MONITORING_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function isHttpsUrl(value: string | undefined, allowUsername = false) {
  try {
    const parsed = new URL(value ?? "");
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.password &&
      (allowUsername || !parsed.username) &&
      !isReservedMonitoringHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function requireHttpsUrl(context: z.RefinementCtx, value: string | undefined, key: string) {
  if (!isHttpsUrl(value)) {
    addIssue(
      context,
      key,
      "must be an HTTPS URL with a non-loopback host outside the IANA-reserved .invalid, .example, and .test namespaces and without embedded credentials",
    );
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
        addIssue(
          context,
          key,
          "must be an HTTPS DSN with a non-loopback host outside the IANA-reserved .invalid, .example, and .test namespaces when Sentry is enabled",
        );
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
