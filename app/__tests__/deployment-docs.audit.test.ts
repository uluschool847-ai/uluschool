import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const deploymentDocs = [
  "docs/deployment/render-production.md",
  "docs/deployment/launch-checklist.md",
  "docs/deployment/browser-verification.md",
  "docs/deployment/rollback.md",
] as const;

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function combinedDeploymentDocs() {
  return deploymentDocs.map((relativePath) => read(relativePath)).join("\n");
}

describe("deployment runbook contract", () => {
  it("documents the exact Render, Cloudflare, verification, and recovery controls", () => {
    const docs = combinedDeploymentDocs();
    const requiredText = [
      "Frankfurt",
      "npm ci --include=dev && npx prisma generate && npm run build",
      "npm run env:check && npx prisma migrate deploy && npx prisma migrate status && npm run bootstrap:production && npm run db:verify",
      "default catalogue levels and subjects",
      "npm run start",
      "/api/health",
      "APP_ENV=staging",
      "APP_ENV=production",
      "uluglobalacademy.com",
      "www.uluglobalacademy.com",
      "Full (strict)",
      "DNS only",
      "remove AAAA",
      "/admin",
      "/portal",
      "/api",
      "point-in-time recovery",
      "forward corrective migration",
    ];

    const missing = requiredText.filter((value) => !docs.includes(value));
    expect(missing, `Missing deployment contract text: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents migration-first setup without a schema-push recovery path", () => {
    const readme = read("README.md");
    const localSetup = read("docs/local-setup.md");
    const knownLimitations = read("docs/known-limitations.md");
    const renderRunbook = read("docs/deployment/render-production.md");

    expect(readme).toContain("npm run db:deploy");
    expect(localSetup).toContain("npm run db:deploy");
    for (const docs of [readme, localSetup, knownLimitations]) {
      expect(docs).not.toContain("prisma db push");
    }
    expect(renderRunbook).toContain(
      "npm run env:check && npx prisma migrate deploy && npx prisma migrate status && npm run bootstrap:production && npm run db:verify",
    );
  });

  it("documents the destructive E2E database isolation contract", () => {
    const readme = read("README.md");
    const localSetup = read("docs/local-setup.md");

    for (const docs of [readme, localSetup]) {
      expect(docs).toContain("E2E_DATABASE_URL");
      expect(docs).toContain("E2E_DIRECT_URL");
      expect(docs).toContain("E2E_DATABASE_RESET_ALLOWED=1");
      expect(docs).toContain("_test");
      expect(docs).toContain("_e2e");
      expect(docs).toContain("loopback");
      expect(docs).toContain("reset");
      expect(docs).toContain("remote");
    }
  });

  it("covers the launch-critical browser workflows", () => {
    const docs = read("docs/deployment/browser-verification.md");
    const requiredText = [
      "/enrol",
      "/contact",
      "Sign in with the bootstrap credential, rotate it, sign out, and sign in again with the new password.",
      "Password rotation cannot be skipped, no authenticator prompt appears, and the second login reaches `/admin`.",
      "one-time credential",
      "student",
      "parent",
      "teacher",
      "unrelated",
      "redeploy",
      "Africa/Nairobi",
      "Kenya local time",
      "360x800",
      "Slow 4G",
      "no horizontal overflow",
      "noindex",
      "indexable",
      "private operations channel",
    ];

    const missing = requiredText.filter((value) => !docs.includes(value));
    expect(missing, `Missing browser verification text: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists every production validation and bootstrap variable", () => {
    const docs = read("docs/deployment/render-production.md");
    const requiredKeys = [
      "RENDER",
      "NODE_ENV",
      "APP_ENV",
      "DATABASE_URL",
      "DIRECT_URL",
      "AUTH_SESSION_SECRET",
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
      "BOOTSTRAP_ADMIN_EMAIL",
      "BOOTSTRAP_ADMIN_NAME",
      "BOOTSTRAP_ADMIN_PASSWORD",
    ];

    const missing = requiredKeys.filter((key) => !docs.includes(`\`${key}\``));
    expect(missing, `Missing deployment environment keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("states the exact monitoring hostname validation scope", () => {
    for (const relativePath of [
      "docs/deployment/render-production.md",
      "docs/deployment/launch-checklist.md",
      ".superpowers/sdd/final-hardening-task-4-report.md",
    ]) {
      const docs = read(relativePath);

      expect(docs).toContain("IANA-reserved");
      expect(docs).toContain("does not reject private, link-local, or unspecified addresses");
      expect(docs).not.toMatch(/\bpublic(?:[\s/-]+provider)?[\s/-]+host(?:name)?\b/i);
    }
  });

  it("does not embed credentials or connection strings", () => {
    const docs = combinedDeploymentDocs();
    const forbiddenPatterns = [
      /postgresql:\/\//i,
      /\bsk_[a-z0-9_-]+/i,
      /BEGIN PRIVATE KEY/i,
      /TURNSTILE_SECRET_KEY\s*=\s*\S+/i,
      /(?:PASSWORD|PASS|SECRET|TOKEN|DSN|ACCESS_KEY_ID)\s*=\s*["']?[A-Za-z0-9+/_.-]{8,}/i,
    ];

    const offenders = forbiddenPatterns
      .filter((pattern) => pattern.test(docs))
      .map((pattern) => pattern.source);
    expect(offenders, `Credential patterns found: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("active operations documentation", () => {
  const currentDocs = [
    "README.md",
    ".env.example",
    "docs/architecture.md",
    "docs/infrastructure-policy.md",
    "docs/known-limitations.md",
    "docs/local-setup.md",
    "docs/admin-portal-test-plan.md",
    "docs/qa-checklist.md",
    "docs/qa-matrix.md",
  ] as const;
  const passwordOnlyContractDocs = [
    "README.md",
    "app/privacy-policy/page.tsx",
    "docs/product-requirements-document.md",
    "docs/admin-portal-test-plan.md",
  ] as const;

  it("does not advertise the removed shared portal password", () => {
    const offenders = currentDocs.filter((relativePath) =>
      read(relativePath).includes("DEFAULT_PORTAL_PASSWORD"),
    );
    expect(offenders, `Stale password contract in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("matches the pinned Node runtime and current production providers", () => {
    expect(read("README.md")).toContain("Node.js 22");
    expect(read("docs/local-setup.md")).toContain("Node.js 22");

    const infrastructure = read("docs/infrastructure-policy.md");
    expect(infrastructure).toContain("Render PostgreSQL");
    expect(infrastructure).toContain("GitHub Actions");
    expect(infrastructure).toContain("private operations channel");
    expect(infrastructure).not.toMatch(/\b(?:Neon|Vercel|Slack)\b/i);
  });

  it("describes session-authorized uploads and private hosted storage", () => {
    const activeUploadDocs = [
      read("README.md"),
      read("docs/local-setup.md"),
      read("docs/known-limitations.md"),
    ].join("\n");

    expect(activeUploadDocs).toContain("private Cloudflare R2");
    expect(activeUploadDocs).toContain("server-side session");
    expect(activeUploadDocs).not.toMatch(/simple role gate|request roles|no S3\/GCS\/Azure/i);
  });

  it("describes password-only application admin access without retired 2FA instructions", () => {
    const forbiddenPatterns = [
      /\bADMIN_REQUIRE_2FA\b/,
      /\bADMIN_2FA_SECRET\b/,
      /\bTWO_FACTOR_ISSUER\b/,
      /\bE2E_ADMIN_REQUIRE_2FA\b/,
      /\/admin\/security\b/,
      /\/portal\/setup\/2fa\b/,
      /\/portal\/login\/verify-2fa\b/,
      /\bTOTP\b/i,
      /\botpauth\b/i,
      /\bauthenticator (?:app|prompt)\b/i,
      /\bbackup codes?\b/i,
      /\badministrator two-factor\b/i,
      /\badmin(?:istrator)? (?:2FA|TOTP)\b/i,
    ] as const;
    const offenders = passwordOnlyContractDocs.flatMap((relativePath) => {
      const source = read(relativePath);
      return forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath}: ${pattern.source}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);

    const activeContract = passwordOnlyContractDocs
      .map((relativePath) => read(relativePath))
      .join("\n");
    expect(activeContract).toContain(
      "administrators authenticate to the application with email and password",
    );
    expect(activeContract).toContain("provider-level 2FA");
  });
});
