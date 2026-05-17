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

describe("Google Calendar environment and dependency readiness", () => {
  it(".env.example declares every Google Calendar integration variable", () => {
    const envExample = readEnvExample();
    const missing = GOOGLE_CALENDAR_ENV_KEYS.filter(
      (key) => !new RegExp(`^${key}\\s*=`, "m").test(envExample),
    );

    expect(missing, `Missing Google Calendar env keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents Europe/Kiev as the GOOGLE_TIMEZONE default", () => {
    expect(readEnvExample()).toMatch(/^GOOGLE_TIMEZONE\s*=\s*Europe\/Kiev\s*$/m);
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
});
