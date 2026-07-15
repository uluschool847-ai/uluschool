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
  it("runs release partitions in production-first order with isolated storage", () => {
    const scripts = readPackageScripts().scripts;
    const runnerSource = readRunnerSource();
    const configSource = readConfigSource();

    expect(scripts["test:e2e"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:initial-admin-2fa && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:release"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:initial-admin-2fa && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:standard"]).toContain("--next-start");
    expect(scripts["test:e2e:initial-admin-2fa"]).toContain("--next-start");
    expect(scripts["test:e2e:focused"]).toBe("node scripts/playwright-test.mjs --isolated-server");
    expect(runnerSource).toContain(
      'if (partition === "storage") process.env.STORAGE_DRIVER = "local";',
    );
    expect(runnerSource).toContain("arg !== nextStartFlag && !partitionFlags.has(arg)");
    expect(configSource).toContain('...(isStoragePartition ? { STORAGE_DRIVER: "local" } : {})');
  });
});
