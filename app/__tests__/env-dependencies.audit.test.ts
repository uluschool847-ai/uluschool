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
  };
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
    return portalPasswordMarkerPattern.test(readFileSync(filePath, "utf8"));
  });
}

const requiredPortalPasswordFallbackPattern =
  /process\.env\.E2E_PORTAL_PASSWORD\s*\?\?\s*process\.env\.SEED_PORTAL_PASSWORD\s*\?\?\s*["']ChangeMe123!["']/;
const portalPasswordMarkerPattern =
  /process\.env\.(?:E2E_PORTAL_PASSWORD|SEED_PORTAL_PASSWORD)|["']ChangeMe123!["']/;

function usesRequiredPortalPasswordFallback(content: string) {
  const requiredFallbackMatches = content.match(
    new RegExp(requiredPortalPasswordFallbackPattern.source, "g"),
  );
  if (requiredFallbackMatches?.length !== 1) return false;

  const markersOutsideRequiredFallback = content.replace(
    new RegExp(requiredPortalPasswordFallbackPattern.source, "g"),
    "",
  );

  return !portalPasswordMarkerPattern.test(markersOutsideRequiredFallback);
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
