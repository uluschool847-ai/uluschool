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
      "npm ci && npx prisma generate && npm run build",
      "npm run env:check && npx prisma migrate deploy && npm run bootstrap:production",
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

  it("covers the launch-critical browser workflows", () => {
    const docs = read("docs/deployment/browser-verification.md");
    const requiredText = [
      "/enrol",
      "/contact",
      "TOTP",
      "backup codes",
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
      "BOOTSTRAP_ADMIN_EMAIL",
      "BOOTSTRAP_ADMIN_NAME",
      "BOOTSTRAP_ADMIN_PASSWORD",
    ];

    const missing = requiredKeys.filter((key) => !docs.includes(`\`${key}\``));
    expect(missing, `Missing deployment environment keys: ${missing.join(", ")}`).toEqual([]);
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
});
