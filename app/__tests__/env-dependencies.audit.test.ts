import "../../__tests__/env-dependencies.test";

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const GOOGLE_CALENDAR_ENV_KEYS = [
  "GOOGLE_CALENDAR_ENABLED",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_IMPERSONATED_USER_EMAIL",
  "GOOGLE_TIMEZONE",
] as const;

function readEnvExample() {
  return readFileSync(join(ROOT, ".env.example"), "utf8");
}

function readPackageJson() {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
}

function envValue(key: string) {
  const match = readEnvExample().match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim();
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (["node_modules", ".git", ".next", "coverage"].includes(entry)) return [];
      return walk(fullPath);
    }
    return fullPath;
  });
}

function sourceFiles() {
  return [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "lib")]
    .filter(existsSync)
    .flatMap(walk)
    .filter(
      (filePath) =>
        /\.(ts|tsx|js|jsx)$/.test(filePath) && !/(__tests__|\.test\.|\.spec\.)/.test(filePath),
    );
}

function e2eSpecsWithPortalPasswordMarker() {
  const e2eDir = join(ROOT, "e2e");
  if (!existsSync(e2eDir)) return [];

  return walk(e2eDir).filter((filePath) => {
    if (!filePath.endsWith(".spec.ts")) return false;
    return hasPortalPasswordMarker(readFileSync(filePath, "utf8"));
  });
}

const requiredPortalPasswordFallbackPattern =
  /process\.env\.E2E_PORTAL_PASSWORD\s*\?\?\s*process\.env\.SEED_PORTAL_PASSWORD\s*\?\?\s*["']ChangeMe123!["']/;
const portalPasswordMarkers = [
  "E2E_PORTAL_PASSWORD",
  "SEED_PORTAL_PASSWORD",
  "ChangeMe123!",
] as const;

function hasPortalPasswordMarker(content: string) {
  return portalPasswordMarkers.some((marker) => content.includes(marker));
}

function usesRequiredPortalPasswordFallback(content: string) {
  const requiredFallbackMatches = content.match(
    new RegExp(requiredPortalPasswordFallbackPattern.source, "g"),
  );
  if (requiredFallbackMatches?.length !== 1) return false;

  const markersOutsideRequiredFallback = content.replace(
    new RegExp(requiredPortalPasswordFallbackPattern.source, "g"),
    "",
  );

  return !hasPortalPasswordMarker(markersOutsideRequiredFallback);
}

describe("Google Calendar environment and dependency readiness", () => {
  it(".env.example declares every Google Calendar integration variable", () => {
    const envExample = readEnvExample();
    const missing = GOOGLE_CALENDAR_ENV_KEYS.filter(
      (key) => !new RegExp(`^${key}\\s*=`, "m").test(envExample),
    );

    expect(missing, `Missing Google Calendar env keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents Africa/Nairobi as the GOOGLE_TIMEZONE default", () => {
    expect(readEnvExample()).toMatch(/^GOOGLE_TIMEZONE\s*=\s*Africa\/Nairobi\s*$/m);
  });

  it("declares googleapis as a runtime dependency for Calendar API access", () => {
    const packageJson = readPackageJson();
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(dependencies).toHaveProperty("googleapis");
  });

  it("does not hardcode Google private keys or service-account emails in source", () => {
    const offenders: string[] = [];
    const privateKeyPattern = /-----BEGIN PRIVATE KEY-----/;
    const serviceAccountEmailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.iam\.gserviceaccount\.com/i;

    for (const filePath of sourceFiles()) {
      const content = readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (privateKeyPattern.test(line) || serviceAccountEmailPattern.test(line)) {
          offenders.push(`${relative(ROOT, filePath)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("rejects a compliant decoy alongside an E2E and default-password path", () => {
    const content = `
      const decoy = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
      const password = process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD;
    `;

    expect(usesRequiredPortalPasswordFallback(content)).toBe(false);
  });

  it("rejects a compliant decoy alongside a reversed seed and E2E path", () => {
    const content = `
      const decoy = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
      const password = process.env.SEED_PORTAL_PASSWORD ?? process.env.E2E_PORTAL_PASSWORD;
    `;

    expect(usesRequiredPortalPasswordFallback(content)).toBe(false);
  });

  it("rejects duplicate compliant portal password fallbacks", () => {
    const content = `
      const first = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
      const second = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
    `;

    expect(usesRequiredPortalPasswordFallback(content)).toBe(false);
  });

  it("rejects a residual E2E portal password marker in a comment", () => {
    const content = `
      const password = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
      // E2E_PORTAL_PASSWORD
    `;

    expect(usesRequiredPortalPasswordFallback(content)).toBe(false);
  });

  it("rejects a residual seed portal password marker in bracket notation", () => {
    const content = `
      const password = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
      const seedPassword = process.env["SEED_PORTAL_PASSWORD"];
    `;

    expect(usesRequiredPortalPasswordFallback(content)).toBe(false);
  });

  it("rejects a residual local portal password marker in a template string", () => {
    const content = `
      const password = process.env.E2E_PORTAL_PASSWORD ?? process.env.SEED_PORTAL_PASSWORD ?? "ChangeMe123!";
      const localPassword = \`ChangeMe123!\`;
    `;

    expect(usesRequiredPortalPasswordFallback(content)).toBe(false);
  });

  it("uses exactly one E2E, seed, then local fallback for every portal-password E2E spec", () => {
    const offenders = e2eSpecsWithPortalPasswordMarker()
      .filter((filePath) => {
        const content = readFileSync(filePath, "utf8");
        return !usesRequiredPortalPasswordFallback(content);
      })
      .map((filePath) => relative(ROOT, filePath));

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("production environment startup contract", () => {
  const requiredKeys = [
    "RENDER",
    "NODE_ENV",
    "APP_ENV",
    "DATABASE_URL",
    "DIRECT_URL",
    "AUTH_SESSION_SECRET",
    "ADMIN_REQUIRE_2FA",
    "GOOGLE_TIMEZONE",
    "NEXT_PUBLIC_SITE_URL",
    "TURNSTILE_ENFORCE",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SCHOOL_INBOX_EMAIL",
    "STORAGE_DRIVER",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "PRIVACY_CONTACT_EMAIL",
    "PRIVACY_EMAIL_PROCESSOR_NAME",
    "CRON_SECRET",
    "REMINDER_CRON_TOKEN",
    "ALERT_WEBHOOK_URL",
    "ALERT_TEST_TOKEN",
    "SENTRY_ENABLED",
    "SENTRY_DSN",
    "NEXT_PUBLIC_SENTRY_DSN",
  ] as const;

  it("declares every production contract variable in .env.example", () => {
    const envExample = readEnvExample();
    const missing = requiredKeys.filter((key) => !new RegExp(`^${key}=`, "m").test(envExample));

    expect(missing, `Missing production environment keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps local-safe defaults and empty provider placeholders", () => {
    expect(envValue("APP_ENV")).toBe('""');
    expect(envValue("SENTRY_ENABLED")).toBe('"false"');
    expect(envValue("PRIVACY_CONTACT_EMAIL")).toBe('"info@uluglobalacademy.com"');
    expect(envValue("STORAGE_DRIVER")).toBe('"local"');

    for (const key of [
      "RENDER",
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "PRIVACY_EMAIL_PROCESSOR_NAME",
      "SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_DSN",
    ]) {
      expect(envValue(key), `${key} must use an empty placeholder`).toBe('""');
    }
  });

  it("does not declare platform PORT or the removed shared portal password", () => {
    const envExample = readEnvExample();
    expect(envExample).not.toMatch(/^PORT\s*=/m);
    expect(envExample).not.toMatch(/^DEFAULT_PORTAL_PASSWORD\s*=/m);
  });

  it("does not contain real provider credentials or provider endpoints", () => {
    const envExample = readEnvExample();
    expect(envExample).not.toMatch(/\.r2\.cloudflarestorage\.com/i);
    expect(envExample).not.toMatch(/^SMTP_HOST=".+"/m);
    expect(envExample).not.toMatch(/^SMTP_USER=".+"/m);
    expect(envExample).not.toMatch(/^SMTP_PASS=".+"/m);
    expect(envExample).not.toMatch(/^SENTRY_DSN=".+"/m);
    expect(envExample).not.toMatch(/^NEXT_PUBLIC_SENTRY_DSN=".+"/m);
    expect(envExample).not.toMatch(/-----BEGIN PRIVATE KEY-----/);
  });

  it("gates startup through env:check without changing start or introducing recursion", () => {
    const scripts = readPackageJson().scripts;
    expect(scripts?.["env:check"]).toBe("tsx scripts/check-production-env.ts");
    expect(scripts?.prestart).toBe("npm run env:check");
    expect(scripts?.start).toBe("next start");
    expect(scripts?.["env:check"]).not.toContain("npm run start");
    expect(scripts?.prestart).not.toContain("npm run start");
  });

  it("keeps validation pure and process access isolated to the CLI adapter", () => {
    const validatorSource = readFileSync(join(ROOT, "lib/config/production-env.ts"), "utf8");
    const cliSource = readFileSync(join(ROOT, "scripts/check-production-env.ts"), "utf8");
    const sharedMailboxParserSource = readFileSync(
      join(ROOT, "lib/security/escape-html.ts"),
      "utf8",
    );

    expect(validatorSource).not.toMatch(/process\.env|process\.exit|console\.|\bfetch\s*\(/);
    expect(validatorSource).not.toMatch(/lib\/(?:prisma|storage)|@aws-sdk|@prisma/);
    expect(validatorSource).toMatch(/parseEmailSender/);
    expect(validatorSource).toMatch(/parseSingleMailbox/);
    expect(sharedMailboxParserSource).not.toMatch(
      /process\.env|process\.exit|console\.|\bfetch\s*\(|createTransport|@aws-sdk|@prisma/,
    );
    expect(cliSource.match(/process\.env/g)).toHaveLength(1);
    expect(cliSource).toContain("validateProductionEnv(process.env)");
  });
});
