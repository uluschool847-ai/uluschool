import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function readPackageScripts() {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
}

function readRunnerSource() {
  return readFileSync(join(ROOT, "scripts", "playwright-test.mjs"), "utf8");
}

function readConfigSource() {
  return readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
}

describe("Playwright E2E partition contract", () => {
  it("runs the production release partitions with required admin 2FA isolated", () => {
    const scripts = readPackageScripts().scripts;
    const runnerSource = readRunnerSource();
    const configSource = readConfigSource();

    expect(scripts["test:e2e"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:admin-2fa && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:release"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:admin-2fa && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:standard"]).toContain("--next-start");
    expect(scripts["test:e2e:admin-2fa"]).toBe(
      "node scripts/playwright-test.mjs --isolated-server --admin-2fa-partition --next-start e2e/portals/admin-security.spec.ts e2e/portals/initial-admin-2fa.spec.ts",
    );
    expect(scripts["test:e2e:initial-admin-2fa"]).toBe(
      "node scripts/playwright-test.mjs --isolated-server --admin-2fa-partition --next-start e2e/portals/initial-admin-2fa.spec.ts",
    );
    expect(scripts["test:e2e:focused"]).toBe("node scripts/playwright-test.mjs --isolated-server");
    expect(runnerSource).toContain('["--admin-2fa-partition", "admin-2fa"],');
    expect(runnerSource).toContain('partition === "admin-2fa"');
    expect(runnerSource).toContain('"e2e/portals/admin-security.spec.ts"');
    expect(runnerSource).toContain('"e2e/portals/initial-admin-2fa.spec.ts"');
    expect(runnerSource).toContain(
      'if (partition === "storage") process.env.STORAGE_DRIVER = "local";',
    );
    expect(runnerSource).toContain(
      "process.env.ADMIN_REQUIRE_2FA = process.env.E2E_ADMIN_REQUIRE_2FA;",
    );
    expect(runnerSource).toContain("arg !== nextStartFlag && !partitionFlags.has(arg)");
    expect(configSource).toContain(
      "const adminTwoFactorSpecPattern = /(?:admin-security|initial-admin-2fa)\\.spec\\.ts$/;",
    );
    expect(configSource).toContain(
      'partition === "standard" ? [storageSpecPattern, adminTwoFactorSpecPattern] : undefined',
    );
    expect(configSource).toContain(
      'E2E_ADMIN_REQUIRE_2FA: adminTwoFactorRequired ? "true" : "false",',
    );
    expect(configSource).toContain('ADMIN_REQUIRE_2FA: adminTwoFactorRequired ? "true" : "false",');
    expect(configSource).toContain('...(isStoragePartition ? { STORAGE_DRIVER: "local" } : {})');
  });
});
