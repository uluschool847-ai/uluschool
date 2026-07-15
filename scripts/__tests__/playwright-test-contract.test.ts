import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNNER = join(ROOT, "scripts", "playwright-test.mjs");
const temporaryDirectories: string[] = [];

type Capture = {
  args: string[];
  environment: Record<string, string | null>;
  source: string;
};

const hostileEnvironment = {
  PLAYWRIGHT_BASE_URL: "http://hostile.example.test:4444",
  PORT: "4444",
  PLAYWRIGHT_REUSE_EXISTING_SERVER: "true",
  PLAYWRIGHT_SERVER_COMMAND: "hostile-playwright-server",
  E2E_PLAYWRIGHT_SERVER_COMMAND: "hostile-e2e-playwright-server",
  STORAGE_DRIVER: "hostile-storage",
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function writeCaptureCli(directory: string, source: string) {
  const cli = join(directory, `${source}-playwright-cli.mjs`);
  const sourceLiteral = JSON.stringify(source);

  writeFileSync(
    cli,
    `import { writeFileSync } from "node:fs";

const captureFile = process.env.PLAYWRIGHT_TEST_CAPTURE_FILE;

if (!captureFile) {
  throw new Error("PLAYWRIGHT_TEST_CAPTURE_FILE is required for the test capture CLI.");
}

const capturedEnvironment = Object.fromEntries(
  [
    "PLAYWRIGHT_BASE_URL",
    "PORT",
    "PLAYWRIGHT_REUSE_EXISTING_SERVER",
    "PLAYWRIGHT_SERVER_COMMAND",
    "E2E_PLAYWRIGHT_SERVER_COMMAND",
    "E2E_ADMIN_REQUIRE_2FA",
    "ADMIN_REQUIRE_2FA",
    "E2E_PARTITION",
    "STORAGE_DRIVER",
  ].map((name) => [name, process.env[name] ?? null]),
);

writeFileSync(
  captureFile,
  JSON.stringify({ source: ${sourceLiteral}, args: process.argv.slice(2), environment: capturedEnvironment }),
);

process.exit(Number(process.env.PLAYWRIGHT_TEST_EXIT_CODE ?? "0"));
`,
  );

  return cli;
}

function runRunner(
  args: string[],
  environment: Record<string, string> = {},
): { capture: Capture; status: number | null } {
  const directory = mkdtempSync(join(tmpdir(), "ulu-playwright-runner-"));
  temporaryDirectories.push(directory);
  const captureFile = join(directory, "capture.json");
  const explicitCli = writeCaptureCli(directory, "explicit");
  const ambientCli = writeCaptureCli(directory, "ambient");
  const result = spawnSync(
    process.execPath,
    [RUNNER, `--test-playwright-cli=${explicitCli}`, ...args],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        ...hostileEnvironment,
        ...environment,
        NODE_ENV: "test",
        PLAYWRIGHT_TEST_CAPTURE_FILE: captureFile,
        PLAYWRIGHT_TEST_CLI: ambientCli,
      },
    },
  );

  if (!existsSync(captureFile)) {
    throw new Error(`Capture CLI did not run. stderr: ${result.stderr}`);
  }

  return {
    capture: JSON.parse(readFileSync(captureFile, "utf8")) as Capture,
    status: result.status,
  };
}

function runProductionRunner(useExplicitHook: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "ulu-playwright-runner-production-"));
  temporaryDirectories.push(directory);
  const captureFile = join(directory, "capture.json");
  const explicitCli = writeCaptureCli(directory, "explicit");
  const ambientCli = writeCaptureCli(directory, "ambient");
  const args = useExplicitHook ? [`--test-playwright-cli=${explicitCli}`] : ["--help"];
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ...hostileEnvironment,
      NODE_ENV: "production",
      PLAYWRIGHT_TEST_CAPTURE_FILE: captureFile,
      PLAYWRIGHT_TEST_CLI: ambientCli,
    },
  });

  return { captureFile, result };
}

function expectIsolatedServer(capture: Capture) {
  const baseUrl = new URL(capture.environment.PLAYWRIGHT_BASE_URL ?? "");

  expect(baseUrl.hostname).toBe("localhost");
  expect(baseUrl.port).toMatch(/^\d+$/);
  expect(baseUrl.port).not.toBe("4444");
  expect(capture.environment.PORT).toBe(baseUrl.port);
  expect(capture.environment.PLAYWRIGHT_REUSE_EXISTING_SERVER).toBe("false");
  expect(capture.environment.PLAYWRIGHT_SERVER_COMMAND).toBeNull();
}

function expectWrapperFlagsRemoved(capture: Capture) {
  expect(capture.source).toBe("explicit");
  expect(capture.args).not.toContain("--isolated-server");
  expect(capture.args).not.toContain("--next-start");
  expect(capture.args).not.toContain("--admin-2fa-partition");
  expect(capture.args).not.toContain("--standard-partition");
  expect(capture.args).not.toContain("--storage-partition");
  expect(capture.args.some((arg) => arg.startsWith("--test-playwright-cli="))).toBe(false);
}

function readPackageScripts() {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
}

function readConfigSource() {
  return readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
}

describe("Playwright E2E partition contract", () => {
  it("runs the production release partitions with required admin 2FA isolated", () => {
    const scripts = readPackageScripts().scripts;
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

  it("normalizes an isolated admin-2fa child and forwards only Playwright arguments", () => {
    const { capture, status } = runRunner(
      [
        "--isolated-server",
        "--admin-2fa-partition",
        "--next-start",
        "e2e/portals/admin-security.spec.ts",
        "--grep",
        "TOTP",
      ],
      { ADMIN_REQUIRE_2FA: "false", E2E_ADMIN_REQUIRE_2FA: "false" },
    );

    expect(status).toBe(0);
    expectIsolatedServer(capture);
    expect(capture.environment).toMatchObject({
      ADMIN_REQUIRE_2FA: "true",
      E2E_ADMIN_REQUIRE_2FA: "true",
      E2E_PARTITION: "admin-2fa",
      E2E_PLAYWRIGHT_SERVER_COMMAND: "npx next start",
    });
    expect(capture.args).toEqual(["test", "e2e/portals/admin-security.spec.ts", "--grep", "TOTP"]);
    expectWrapperFlagsRemoved(capture);
  });

  it("forces standard policy false while retaining the partition next-start command", () => {
    const { capture, status } = runRunner(
      ["--isolated-server", "--standard-partition", "--next-start", "--list"],
      { ADMIN_REQUIRE_2FA: "true", E2E_ADMIN_REQUIRE_2FA: "true" },
    );

    expect(status).toBe(0);
    expectIsolatedServer(capture);
    expect(capture.environment).toMatchObject({
      ADMIN_REQUIRE_2FA: "false",
      E2E_ADMIN_REQUIRE_2FA: "false",
      E2E_PARTITION: "standard",
      E2E_PLAYWRIGHT_SERVER_COMMAND: "npx next start",
    });
    expect(capture.args).toEqual(["test", "--list"]);
    expectWrapperFlagsRemoved(capture);
  });

  it("forces storage policy and local storage without retaining hostile server commands", () => {
    const { capture, status } = runRunner(
      ["--isolated-server", "--storage-partition", "e2e/portals/teacher-materials.spec.ts"],
      { ADMIN_REQUIRE_2FA: "true", E2E_ADMIN_REQUIRE_2FA: "true" },
    );

    expect(status).toBe(0);
    expectIsolatedServer(capture);
    expect(capture.environment).toMatchObject({
      ADMIN_REQUIRE_2FA: "false",
      E2E_ADMIN_REQUIRE_2FA: "false",
      E2E_PARTITION: "storage",
      E2E_PLAYWRIGHT_SERVER_COMMAND: null,
      STORAGE_DRIVER: "local",
    });
    expect(capture.args).toEqual(["test", "e2e/portals/teacher-materials.spec.ts"]);
    expectWrapperFlagsRemoved(capture);
  });

  it.each(["e2e/portals/admin-security.spec.ts", "e2e/portals/initial-admin-2fa.spec.ts"])(
    "infers required 2FA for the focused exact path %s",
    (specPath) => {
      const { capture, status } = runRunner(["--isolated-server", specPath, "--reporter=line"], {
        ADMIN_REQUIRE_2FA: "false",
        E2E_ADMIN_REQUIRE_2FA: "false",
      });

      expect(status).toBe(0);
      expectIsolatedServer(capture);
      expect(capture.environment).toMatchObject({
        ADMIN_REQUIRE_2FA: "true",
        E2E_ADMIN_REQUIRE_2FA: "true",
        E2E_PARTITION: "focused",
        E2E_PLAYWRIGHT_SERVER_COMMAND: null,
      });
      expect(capture.args).toEqual(["test", specPath, "--reporter=line"]);
      expectWrapperFlagsRemoved(capture);
    },
  );

  it("propagates the Playwright child numeric exit code", () => {
    const { capture, status } = runRunner(
      ["--isolated-server", "--standard-partition", "--next-start"],
      { PLAYWRIGHT_TEST_EXIT_CODE: "23" },
    );

    expectWrapperFlagsRemoved(capture);
    expect(capture.args).toEqual(["test"]);
    expect(status).toBe(23);
  });

  it("ignores hostile ambient CLI injection outside test mode", () => {
    const { captureFile, result } = runProductionRunner(false);

    expect(result.status).toBe(0);
    expect(existsSync(captureFile)).toBe(false);
  });

  it("rejects the explicit CLI hook outside test mode", () => {
    const { captureFile, result } = runProductionRunner(true);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--test-playwright-cli is only available when NODE_ENV=test.");
    expect(existsSync(captureFile)).toBe(false);
  });
});
