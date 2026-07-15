import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validateProductionEnv } from "@/lib/config/production-env";

const ROOT = process.cwd();
const PRODUCTION_ORIGIN = "https://uluglobalacademy.com";
const R2_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

function validProductionEnv(): Record<string, string> {
  return {
    RENDER: "true",
    NODE_ENV: "production",
    APP_ENV: "production",
    DATABASE_URL:
      "postgresql://app_user:database-credential@database.internal:5432/ulu_school?sslmode=require",
    DIRECT_URL:
      "postgres://migration_user:direct-credential@direct.internal:5432/ulu_school?sslmode=require",
    AUTH_SESSION_SECRET: "auth-session-value-7f4b2d9c6a1e8f3d",
    ADMIN_REQUIRE_2FA: "true",
    GOOGLE_TIMEZONE: "Africa/Nairobi",
    NEXT_PUBLIC_SITE_URL: PRODUCTION_ORIGIN,
    TURNSTILE_ENFORCE: "true",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key-value",
    TURNSTILE_SECRET_KEY: "turnstile-secret-key-value",
    SMTP_HOST: "smtp.provider.invalid",
    SMTP_PORT: "587",
    SMTP_USER: "smtp-service-user",
    SMTP_PASS: "smtp-provider-credential",
    SMTP_FROM: "ULU Online School <no-reply@uluglobalacademy.com>",
    SCHOOL_INBOX_EMAIL: "info@uluglobalacademy.com",
    STORAGE_DRIVER: "r2",
    R2_ENDPOINT: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    R2_ACCESS_KEY_ID: "r2-access-key-value",
    R2_SECRET_ACCESS_KEY: "r2-secret-access-key-value",
    R2_BUCKET_NAME: "ulu-school-private",
    PRIVACY_CONTACT_EMAIL: "privacy@uluglobalacademy.com",
    PRIVACY_EMAIL_PROCESSOR_NAME: "Transactional Mail Provider",
    CRON_SECRET: "cron-authentication-value-4c8f1a6d2e9b",
    REMINDER_CRON_TOKEN: "reminder-job-token-value-1a7d4e9c6b2f",
    ALERT_WEBHOOK_URL: "https://alerts.invalid/hooks/operations",
    ALERT_TEST_TOKEN: "alert-test-authentication-6e2c9a4f1d8b",
    SENTRY_ENABLED: "false",
    SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
  };
}

function invalidResult(env: Readonly<Record<string, string | undefined>>) {
  const result = validateProductionEnv(env);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected production environment validation to fail");
  return result;
}

function expectInvalidKey(
  key: string,
  value: string | undefined,
  overrides: Record<string, string | undefined> = {},
) {
  const env: Record<string, string | undefined> = { ...validProductionEnv(), ...overrides };
  if (value === undefined) delete env[key];
  else env[key] = value;

  const result = invalidResult(env);
  expect(result.errors.map((error) => error.key)).toContain(key);
}

function cliSystemEnv() {
  const names = ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "ComSpec"];
  return Object.fromEntries(
    names.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  );
}

function runCli(env: Record<string, string>) {
  return spawnSync(
    process.execPath,
    [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/check-production-env.ts"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...cliSystemEnv(), ...env },
    },
  );
}

describe("validateProductionEnv", () => {
  it("accepts the complete production contract", () => {
    expect(validateProductionEnv(validProductionEnv())).toEqual({
      ok: true,
      skipped: false,
      appEnv: "production",
    });
  });

  it.each([
    ["NODE_ENV", undefined],
    ["APP_ENV", undefined],
    ["DATABASE_URL", "mysql://database.invalid/ulu_school"],
    ["DIRECT_URL", "https://database.invalid/ulu_school"],
    ["AUTH_SESSION_SECRET", "too-short"],
    ["ADMIN_REQUIRE_2FA", "false"],
    ["GOOGLE_TIMEZONE", "UTC"],
    ["NEXT_PUBLIC_SITE_URL", "http://uluglobalacademy.com"],
    ["TURNSTILE_ENFORCE", "false"],
    ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", ""],
    ["TURNSTILE_SECRET_KEY", "change-this-turnstile-secret"],
    ["SMTP_HOST", ""],
    ["SMTP_PORT", "0"],
    ["SMTP_USER", ""],
    ["SMTP_PASS", "placeholder"],
    ["SMTP_FROM", "not-an-email-address"],
    ["SCHOOL_INBOX_EMAIL", "not-an-email-address"],
    ["STORAGE_DRIVER", "local"],
    ["R2_ENDPOINT", "https://storage.invalid"],
    ["R2_ACCESS_KEY_ID", ""],
    ["R2_SECRET_ACCESS_KEY", "replace-this-r2-secret"],
    ["R2_BUCKET_NAME", "Invalid_Bucket"],
    ["PRIVACY_CONTACT_EMAIL", "not-an-email-address"],
    ["PRIVACY_EMAIL_PROCESSOR_NAME", ""],
    ["CRON_SECRET", "too-short"],
    ["REMINDER_CRON_TOKEN", "change-this-reminder-token-value-long-enough"],
    ["ALERT_WEBHOOK_URL", "http://alerts.invalid/hook"],
    ["ALERT_TEST_TOKEN", "too-short"],
  ])("rejects an unsafe or missing %s", (key, value) => {
    expectInvalidKey(key, value);
  });

  it.each([{}, { NODE_ENV: "development" }, { RENDER: "false", APP_ENV: "" }])(
    "skips intentional local development for %j",
    (env) => {
      expect(validateProductionEnv(env)).toEqual({ ok: true, skipped: true });
    },
  );

  it("enforces a production-like APP_ENV even when RENDER is absent", () => {
    const env = validProductionEnv();
    Reflect.deleteProperty(env, "RENDER");
    Reflect.deleteProperty(env, "AUTH_SESSION_SECRET");

    expect(invalidResult(env).errors.map((error) => error.key)).toContain("AUTH_SESSION_SECRET");
  });

  it.each(["development", "preview", "Production", " production ", "local"])(
    "rejects invalid nonblank APP_ENV=%s instead of treating it as local",
    (appEnv) => {
      expectInvalidKey("APP_ENV", appEnv, { RENDER: "false" });
    },
  );

  it.each(["postgresql:", "postgres:"])("accepts the %s database protocol", (protocol) => {
    const env = validProductionEnv();
    env.DATABASE_URL = `${protocol}//database_user:credential@database.invalid:5432/app`;
    env.DIRECT_URL = `${protocol}//direct_user:credential@direct.invalid:5432/app`;

    expect(validateProductionEnv(env).ok).toBe(true);
  });

  it.each([
    "mysql://database.invalid/app",
    "https://database.invalid/app",
    "not-a-url",
    "postgresql://database.invalid:70000/app",
  ])("rejects an invalid database URL without exposing it", (databaseUrl) => {
    const result = invalidResult({ ...validProductionEnv(), DATABASE_URL: databaseUrl });
    expect(result.errors.map((error) => error.key)).toContain("DATABASE_URL");
    expect(JSON.stringify(result)).not.toContain(databaseUrl);
  });

  it.each(["", "0", "65536", "1.5", "not-a-port"])("rejects invalid SMTP_PORT %s", (port) => {
    expectInvalidKey("SMTP_PORT", port);
  });

  it.each(["1", "465", "587", "65535"])("accepts SMTP_PORT %s", (port) => {
    expect(validateProductionEnv({ ...validProductionEnv(), SMTP_PORT: port }).ok).toBe(true);
  });

  it.each(["AUTH_SESSION_SECRET", "CRON_SECRET", "REMINDER_CRON_TOKEN", "ALERT_TEST_TOKEN"])(
    "requires a 32+ character non-placeholder %s",
    (key) => {
      expectInvalidKey(key, "short-value");
      expectInvalidKey(key, "change-this-placeholder-value-that-is-long-enough");
      expectInvalidKey(key, "dummy-credential-value-that-is-long-enough");
      expectInvalidKey(key, "x".repeat(40));
    },
  );

  it("requires the exact production site origin", () => {
    for (const origin of [
      `${PRODUCTION_ORIGIN}/`,
      "https://www.uluglobalacademy.com",
      "https://staging.uluglobalacademy.com",
    ]) {
      expectInvalidKey("NEXT_PUBLIC_SITE_URL", origin);
    }
  });

  it("accepts a distinct HTTPS staging origin", () => {
    const env = {
      ...validProductionEnv(),
      APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "https://staging.uluglobalacademy.com",
    };

    expect(validateProductionEnv(env)).toEqual({
      ok: true,
      skipped: false,
      appEnv: "staging",
    });
  });

  it.each([
    PRODUCTION_ORIGIN,
    "http://staging.uluglobalacademy.com",
    "https://staging.uluglobalacademy.com/path",
    "https://operator@staging.uluglobalacademy.com",
  ])("rejects an unsafe or production staging origin", (origin) => {
    expectInvalidKey("NEXT_PUBLIC_SITE_URL", origin, { APP_ENV: "staging" });
  });

  it.each([
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    `https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
    `https://${R2_ACCOUNT_ID}.fedramp.r2.cloudflarestorage.com`,
  ])("accepts a documented R2 endpoint", (endpoint) => {
    expect(validateProductionEnv({ ...validProductionEnv(), R2_ENDPOINT: endpoint }).ok).toBe(true);
  });

  it.each([
    `http://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    "https://storage.invalid",
    `https://${R2_ACCOUNT_ID}.apac.r2.cloudflarestorage.com`,
    `https://bucket.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com:443`,
    `https://operator:credential@${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/objects`,
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com?token=credential`,
  ])("rejects an undocumented R2 endpoint without exposing it", (endpoint) => {
    const result = invalidResult({ ...validProductionEnv(), R2_ENDPOINT: endpoint });
    expect(result.errors.map((error) => error.key)).toContain("R2_ENDPOINT");
    expect(JSON.stringify(result)).not.toContain(endpoint);
  });

  it("requires both HTTPS Sentry DSNs when Sentry is enabled", () => {
    const enabled = {
      ...validProductionEnv(),
      SENTRY_ENABLED: "true",
      SENTRY_DSN: "https://server-public-key@sentry.invalid/1",
      NEXT_PUBLIC_SENTRY_DSN: "https://client-public-key@sentry.invalid/2",
    };

    expect(validateProductionEnv(enabled).ok).toBe(true);
    expectInvalidKey("SENTRY_DSN", "", enabled);
    expectInvalidKey("NEXT_PUBLIC_SENTRY_DSN", "http://client@sentry.invalid/2", enabled);
  });

  it("requires both Sentry DSNs to be empty when Sentry is disabled", () => {
    expectInvalidKey("SENTRY_DSN", "https://server@sentry.invalid/1");
    expectInvalidKey("NEXT_PUBLIC_SENTRY_DSN", "https://client@sentry.invalid/2");
    expectInvalidKey("SENTRY_DSN", "   ");
  });

  it.each([undefined, "1", "TRUE", "yes"])("rejects an unsafe SENTRY_ENABLED value %s", (value) => {
    expectInvalidKey("SENTRY_ENABLED", value);
  });

  it("rejects any nonblank DEFAULT_PORTAL_PASSWORD", () => {
    expectInvalidKey("DEFAULT_PORTAL_PASSWORD", "shared-portal-credential");
    expect(
      validateProductionEnv({ ...validProductionEnv(), DEFAULT_PORTAL_PASSWORD: "   " }).ok,
    ).toBe(true);
  });

  it("returns deterministic deduplicated errors without rejected values or parsed details", () => {
    const secretValues = [
      "leaked-session-value",
      "https://operator:credential@private-host.invalid/path?token=leak",
      "private-smtp-user",
      "shared-password-value",
    ];
    const env = {
      ...validProductionEnv(),
      AUTH_SESSION_SECRET: secretValues[0],
      ALERT_WEBHOOK_URL: secretValues[1],
      SMTP_USER: secretValues[2],
      DEFAULT_PORTAL_PASSWORD: secretValues[3],
    };

    const first = invalidResult(env);
    const second = invalidResult(env);
    expect(first.errors).toEqual(second.errors);
    expect(first.errors.map((error) => error.key)).toEqual([
      ...new Set(first.errors.map((error) => error.key)),
    ]);

    const serialized = JSON.stringify(first);
    for (const value of secretValues) expect(serialized).not.toContain(value);
    expect(serialized).not.toContain("private-host.invalid");
    expect(serialized).not.toContain("operator");
    expect(serialized).not.toContain("private-smtp-user".length.toString());
  });
});

describe("production environment CLI", () => {
  it("exits 0 with deterministic output for intentionally skipped local development", () => {
    const result = runCli({ NODE_ENV: "development" });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "Production environment validation skipped for local development.\n",
    );
    expect(result.stderr).toBe("");
  });

  it("exits 0 for a valid production environment", () => {
    const result = runCli(validProductionEnv());

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("Production environment validation passed.\n");
    expect(result.stderr).toBe("");
  });

  it("exits 1 with concise deterministic value-free errors", () => {
    const rejectedSecret = "rejected-session-value";
    const rejectedUrl = "https://operator:credential@private-host.invalid/path";
    const env = {
      ...validProductionEnv(),
      AUTH_SESSION_SECRET: rejectedSecret,
      ALERT_WEBHOOK_URL: rejectedUrl,
    };

    const first = runCli(env);
    const second = runCli(env);
    expect(first.status).toBe(1);
    expect(first.stdout).toBe("");
    expect(first.stderr).toBe(second.stderr);
    expect(first.stderr).toMatch(/^Production environment validation failed:\n/);
    expect(first.stderr).toContain("- AUTH_SESSION_SECRET:");
    expect(first.stderr).toContain("- ALERT_WEBHOOK_URL:");
    expect(first.stderr).not.toContain(rejectedSecret);
    expect(first.stderr).not.toContain(rejectedUrl);
    expect(first.stderr).not.toContain("private-host.invalid");
    expect(first.stderr).not.toContain("operator");
  });
});
