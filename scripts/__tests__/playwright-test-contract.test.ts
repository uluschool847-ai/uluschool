import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNNER = join(ROOT, "scripts", "playwright-test.mjs");
const SUBPROCESS_TEST_TIMEOUT_MS = 30_000;
const temporaryDirectories: string[] = [];

type Capture = {
  args: string[];
  environment: Record<string, string | null>;
  matcherResults: Record<string, boolean>;
  retries: number;
  source: string;
  webServerEnvironment: Record<string, string | null>;
};

const signedDeliveryEnvironment = {
  RUN_S4_SIGNED_DELIVERY_E2E: "1",
  STORAGE_DRIVER: "r2",
  R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "r2-access-key-value",
  R2_SECRET_ACCESS_KEY: "r2-secret-key-value",
  R2_BUCKET_NAME: "s4-private-files",
};

const hostileEnvironment = {
  PLAYWRIGHT_BASE_URL: "http://hostile.example.test:4444",
  PORT: "4444",
  PLAYWRIGHT_REUSE_EXISTING_SERVER: "true",
  PLAYWRIGHT_SERVER_COMMAND: "hostile-playwright-server",
  E2E_PLAYWRIGHT_SERVER_COMMAND: "hostile-e2e-playwright-server",
  STORAGE_DRIVER: "hostile-storage",
  RUN_S4_SIGNED_DELIVERY_E2E: "0",
  R2_ENDPOINT: "https://hostile.example.test",
  R2_ACCESS_KEY_ID: "hostile-access-key",
  R2_SECRET_ACCESS_KEY: "hostile-secret-key",
  R2_BUCKET_NAME: "hostile-bucket",
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function writeCaptureCli(directory: string, source: string) {
  const cli = join(directory, `${source}-playwright-cli.mjs`);
  const configLoader = join(directory, `${source}-config-loader.mts`);
  const sourceLiteral = JSON.stringify(source);

  writeFileSync(
    configLoader,
    `import { pathToFileURL } from "node:url";

const configFile = process.env.PLAYWRIGHT_TEST_CONFIG_FILE;

if (!configFile) {
  throw new Error("PLAYWRIGHT_TEST_CONFIG_FILE is required.");
}

const configModule = await import(pathToFileURL(configFile).href);
const config = configModule.default;
const webServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;
const environmentKeys = [
  "PLAYWRIGHT_BASE_URL",
  "PORT",
  "PLAYWRIGHT_REUSE_EXISTING_SERVER",
  "PLAYWRIGHT_SERVER_COMMAND",
  "E2E_PLAYWRIGHT_SERVER_COMMAND",
  "E2E_ADMIN_REQUIRE_2FA",
  "ADMIN_REQUIRE_2FA",
  "E2E_PARTITION",
  "STORAGE_DRIVER",
  "RUN_S4_SIGNED_DELIVERY_E2E",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];
const webServerEnvironment = Object.fromEntries(
  environmentKeys.map((name) => [name, webServer?.env?.[name] ?? null]),
);
const ignorePatterns = (Array.isArray(config.testIgnore) ? config.testIgnore : [config.testIgnore])
  .filter((pattern) => pattern instanceof RegExp);
const matcherPaths = [
  "e2e/storage/signed-file-delivery.spec.ts",
  "e2e\\\\storage\\\\signed-file-delivery.spec.ts",
  "e2e/other/signed-file-delivery.spec.ts",
  "e2e\\\\other\\\\signed-file-delivery.spec.ts",
];
const matcherResults = Object.fromEntries(
  matcherPaths.map((filePath) => [
    filePath,
    ignorePatterns.some((pattern) => pattern.test(filePath)),
  ]),
);

process.stdout.write(JSON.stringify({ matcherResults, retries: config.retries, webServerEnvironment }));
`,
  );

  writeFileSync(
    cli,
    `import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const captureFile = process.env.PLAYWRIGHT_TEST_CAPTURE_FILE;
const configFile = process.env.PLAYWRIGHT_TEST_CONFIG_FILE;

if (!captureFile || !configFile) {
  throw new Error("PLAYWRIGHT_TEST_CAPTURE_FILE and PLAYWRIGHT_TEST_CONFIG_FILE are required.");
}

const requireFromProject = createRequire(configFile);
const tsxCliPath = requireFromProject.resolve("tsx/cli");
const configCapture = spawnSync(
  process.execPath,
  [tsxCliPath, ${JSON.stringify(configLoader)}],
  { encoding: "utf8", env: process.env },
);

if (configCapture.status !== 0) {
  throw new Error("Unable to capture Playwright config: " + configCapture.stderr);
}

const { matcherResults, retries, webServerEnvironment } = JSON.parse(configCapture.stdout);
const environmentKeys = [
  "PLAYWRIGHT_BASE_URL",
  "PORT",
  "PLAYWRIGHT_REUSE_EXISTING_SERVER",
  "PLAYWRIGHT_SERVER_COMMAND",
  "E2E_PLAYWRIGHT_SERVER_COMMAND",
  "E2E_ADMIN_REQUIRE_2FA",
  "ADMIN_REQUIRE_2FA",
  "E2E_PARTITION",
  "STORAGE_DRIVER",
  "RUN_S4_SIGNED_DELIVERY_E2E",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

const capturedEnvironment = Object.fromEntries(
  environmentKeys.map((name) => [name, process.env[name] ?? null]),
);

writeFileSync(
  captureFile,
  JSON.stringify({
    source: ${sourceLiteral},
    args: process.argv.slice(2),
    environment: capturedEnvironment,
    matcherResults,
    retries,
    webServerEnvironment,
  }),
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
        PLAYWRIGHT_TEST_CONFIG_FILE: join(ROOT, "playwright.config.ts"),
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
      PLAYWRIGHT_TEST_CONFIG_FILE: join(ROOT, "playwright.config.ts"),
      PLAYWRIGHT_TEST_CLI: ambientCli,
    },
  });

  return { captureFile, result };
}

function configFor(partition: "focused" | "standard" | "admin-2fa" | "signed-delivery" | "storage") {
  const partitionFlags = {
    "admin-2fa": "--admin-2fa-partition",
    "signed-delivery": "--signed-delivery-partition",
    standard: "--standard-partition",
    storage: "--storage-partition",
  } as const;
  const { capture, status } = runRunner(
    ["--isolated-server", ...(partition === "focused" ? [] : [partitionFlags[partition]]), "--list"],
    { E2E_PARTITION: partition },
  );

  expect(status).toBe(0);
  return capture;
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
  expect(capture.args).not.toContain("--signed-delivery-partition");
  expect(capture.args.some((arg) => arg.startsWith("--test-playwright-cli="))).toBe(false);
}

function readPackageScripts() {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
}

function cliIt(name: string, callback: () => void) {
  it(name, callback, SUBPROCESS_TEST_TIMEOUT_MS);
}

describe("Playwright E2E partition contract", () => {
  cliIt("retries only focused browser tests", () => {
    expect(configFor("focused").retries).toBe(1);
    for (const partition of ["standard", "admin-2fa", "signed-delivery", "storage"] as const) {
      expect(configFor(partition).retries).toBe(0);
    }
  });

  it("runs the production release partitions with required admin 2FA isolated", () => {
    const scripts = readPackageScripts().scripts;

    expect(scripts["test:e2e"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:admin-2fa && npm run test:e2e:signed-delivery && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:release"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:admin-2fa && npm run test:e2e:signed-delivery && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:standard"]).toContain("--next-start");
    expect(scripts["test:e2e:admin-2fa"]).toBe(
      "node scripts/playwright-test.mjs --isolated-server --admin-2fa-partition --next-start e2e/portals/admin-security.spec.ts e2e/portals/initial-admin-2fa.spec.ts",
    );
    expect(scripts["test:e2e:signed-delivery"]).toBe(
      "node scripts/playwright-test.mjs --isolated-server --signed-delivery-partition --next-start e2e/storage/signed-file-delivery.spec.ts",
    );
    expect(scripts["test:e2e:initial-admin-2fa"]).toBe(
      "node scripts/playwright-test.mjs --isolated-server --admin-2fa-partition --next-start e2e/portals/initial-admin-2fa.spec.ts",
    );
    expect(scripts["test:e2e:focused"]).toBe("node scripts/playwright-test.mjs --isolated-server");
  });

  cliIt("standard Playwright collection excludes only the partitioned signed-delivery path", () => {
    const decoyDirectory = mkdtempSync(join(ROOT, "e2e", "playwright-contract-decoy-"));
    temporaryDirectories.push(decoyDirectory);
    const decoySpec = join(decoyDirectory, "signed-file-delivery.spec.ts");
    writeFileSync(
      decoySpec,
      `import { test } from "@playwright/test";\n\ntest("signed delivery decoy remains in standard collection", () => {});\n`,
    );

    const result = spawnSync(
      process.execPath,
      [RUNNER, "--isolated-server", "--standard-partition", "--next-start", "--list"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`.replaceAll("\\", "/");
    const decoyRelativePath = relative(join(ROOT, "e2e"), decoySpec).replaceAll("\\", "/");

    expect(result.status, output).toBe(0);
    expect(output).toContain(decoyRelativePath);
    expect(output).toContain("signed delivery decoy remains in standard collection");
    expect(output).not.toContain("storage/signed-file-delivery.spec.ts");
    expect(output).not.toContain("portals/admin-security.spec.ts");
    expect(output).not.toContain("portals/initial-admin-2fa.spec.ts");
    expect(output).not.toContain("portals/admin-teachers.spec.ts");
    expect(output).not.toContain("portals/teacher-academics.spec.ts");
    expect(output).not.toContain("portals/teacher-materials.spec.ts");
  });

  cliIt("matches the signed-delivery ignore on exact Windows and POSIX path components", () => {
    const { capture, status } = runRunner([
      "--isolated-server",
      "--standard-partition",
      "--next-start",
      "--list",
    ]);

    expect(status).toBe(0);
    expect(capture.matcherResults).toEqual({
      "e2e/storage/signed-file-delivery.spec.ts": true,
      "e2e\\storage\\signed-file-delivery.spec.ts": true,
      "e2e/other/signed-file-delivery.spec.ts": false,
      "e2e\\other\\signed-file-delivery.spec.ts": false,
    });
  });

  cliIt("normalizes an isolated admin-2fa child and forwards only Playwright arguments", () => {
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

  cliIt("forces standard policy false while retaining the partition next-start command", () => {
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

  cliIt("forces storage policy and local storage without retaining hostile server commands", () => {
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

  cliIt(
    "forces deterministic offline signed-delivery storage and forwards only the exact spec",
    () => {
      const { capture, status } = runRunner([
        "--isolated-server",
        "--signed-delivery-partition",
        "--next-start",
        "e2e/storage/signed-file-delivery.spec.ts",
      ]);

      expect(status).toBe(0);
      expectIsolatedServer(capture);
      expect(capture.environment).toMatchObject({
        ADMIN_REQUIRE_2FA: "false",
        E2E_ADMIN_REQUIRE_2FA: "false",
        E2E_PARTITION: "signed-delivery",
        E2E_PLAYWRIGHT_SERVER_COMMAND: "npx next start",
        ...signedDeliveryEnvironment,
      });
      expect(capture.webServerEnvironment).toMatchObject(signedDeliveryEnvironment);
      expect(capture.args).toEqual(["test", "e2e/storage/signed-file-delivery.spec.ts"]);
      expectWrapperFlagsRemoved(capture);
    },
  );

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
    SUBPROCESS_TEST_TIMEOUT_MS,
  );

  cliIt("propagates the Playwright child numeric exit code", () => {
    const { capture, status } = runRunner(
      ["--isolated-server", "--standard-partition", "--next-start"],
      { PLAYWRIGHT_TEST_EXIT_CODE: "23" },
    );

    expectWrapperFlagsRemoved(capture);
    expect(capture.args).toEqual(["test"]);
    expect(status).toBe(23);
  });

  cliIt("ignores hostile ambient CLI injection outside test mode", () => {
    const { captureFile, result } = runProductionRunner(false);

    expect(result.status).toBe(0);
    expect(existsSync(captureFile)).toBe(false);
  });

  cliIt("rejects the explicit CLI hook outside test mode", () => {
    const { captureFile, result } = runProductionRunner(true);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--test-playwright-cli is only available when NODE_ENV=test.");
    expect(existsSync(captureFile)).toBe(false);
  });
});
