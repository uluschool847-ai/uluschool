import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RUNNER = join(ROOT, "scripts", "playwright-test.mjs");
const ADMIN_SMOKE = join(ROOT, "scripts", "admin-smoke.mjs");
const RELEASE_REPORTER = join(ROOT, "scripts", "playwright-release-reporter.mjs");
const HOSTILE_REPORTER_MARKER = "Hostile status reporter restored passed status.";
const RELEASE_CONFIG_ERROR =
  "Release Playwright partitions do not accept caller --config/-c overrides.";
const SUBPROCESS_TEST_TIMEOUT_MS = 30_000;
const temporaryDirectories: string[] = [];

type Capture = {
  args: string[];
  environment: Record<string, string | null>;
  forbidOnly: boolean;
  matcherResults: Record<string, boolean>;
  reporters: string[];
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
  PW_TEST_REPORTER: "hostile-playwright-reporter",
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
  "PW_TEST_REPORTER",
  "PLAYWRIGHT_REUSE_EXISTING_SERVER",
  "PLAYWRIGHT_SERVER_COMMAND",
  "E2E_PLAYWRIGHT_SERVER_COMMAND",
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
const reporters = (
  Array.isArray(config.reporter) ? config.reporter : config.reporter ? [config.reporter] : []
).map((reporter) => Array.isArray(reporter) ? reporter[0] : reporter);

process.stdout.write(JSON.stringify({
  forbidOnly: config.forbidOnly === true,
  matcherResults,
  reporters,
  retries: config.retries,
  webServerEnvironment,
}));
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

const { forbidOnly, matcherResults, reporters, retries, webServerEnvironment } = JSON.parse(configCapture.stdout);
const environmentKeys = [
  "PLAYWRIGHT_BASE_URL",
  "PORT",
  "PW_TEST_REPORTER",
  "PLAYWRIGHT_REUSE_EXISTING_SERVER",
  "PLAYWRIGHT_SERVER_COMMAND",
  "E2E_PLAYWRIGHT_SERVER_COMMAND",
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
    forbidOnly,
    matcherResults,
    reporters,
    retries,
    webServerEnvironment,
  }),
);

process.exit(Number(process.env.PLAYWRIGHT_TEST_EXIT_CODE ?? "0"));
`,
  );

  return cli;
}

function invokeRunner(args: string[], environment: Record<string, string> = {}) {
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

  return { captureFile, result };
}

function runRunner(
  args: string[],
  environment: Record<string, string> = {},
): { capture: Capture; status: number | null } {
  const { captureFile, result } = invokeRunner(args, environment);

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

function runActualPlaywrightFixture(
  source: string,
  options: {
    args?: string[];
    callerConfig?: "equals" | "separate" | "short-attached" | "short-equals" | "short-separate";
    callerReporter?: "hostile";
    environmentReporter?: "hostile";
    forbidOnly?: boolean;
    partition?: "focused" | "standard";
    specFileName?: string;
  } = {},
): {
  bridgeRan: boolean;
  hostileConfigRan: boolean;
  output: string;
  status: number | null;
} {
  const directory = mkdtempSync(join(ROOT, ".playwright-release-contract-"));
  temporaryDirectories.push(directory);
  const configFile = join(directory, "playwright.config.mjs");
  const bridgeFile = join(directory, "fixture-playwright-cli.mjs");
  const bridgeMarkerFile = join(directory, "fixture-playwright-cli-ran.txt");
  const hostileConfigFile = join(directory, "hostile-playwright.config.mjs");
  const hostileConfigMarkerFile = join(directory, "hostile-playwright-config-ran.txt");
  const hostileReporterFile = join(directory, "hostile-reporter.mjs");
  const specFile = join(directory, options.specFileName ?? "release-gate.spec.mjs");
  const realPlaywrightCli = join(ROOT, "node_modules", "@playwright", "test", "cli.js");

  writeFileSync(
    configFile,
    `import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: ${JSON.stringify(options.forbidOnly ?? false)},
  outputDir: ${JSON.stringify(join(directory, "results"))},
  reporter: "line",
  testDir: ${JSON.stringify(directory)},
  workers: 1,
});
`,
  );
  writeFileSync(
    hostileReporterFile,
    `export default class HostileStatusReporter {
  onEnd() {
    process.stderr.write(${JSON.stringify(`${HOSTILE_REPORTER_MARKER}\n`)});
    return { status: "passed" };
  }

  printsToStdio() {
    return false;
  }
}
`,
  );
  writeFileSync(
    hostileConfigFile,
    `import { writeFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

writeFileSync(${JSON.stringify(hostileConfigMarkerFile)}, "ran");
process.env.PW_TEST_REPORTER = ${JSON.stringify(hostileReporterFile)};

export default defineConfig({
  outputDir: ${JSON.stringify(join(directory, "hostile-results"))},
  reporter: "line",
  testDir: ${JSON.stringify(directory)},
  workers: 1,
});
`,
  );
  writeFileSync(
    bridgeFile,
    `import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

writeFileSync(${JSON.stringify(bridgeMarkerFile)}, "ran");
const args = process.argv.slice(2);
const hasCallerConfig = ${JSON.stringify(options.callerConfig !== undefined)};
const forwardedArgs = hasCallerConfig
  ? args
  : [args[0], ${JSON.stringify(`--config=${configFile}`)}, ...args.slice(1)];
const result = spawnSync(
  process.execPath,
  [${JSON.stringify(realPlaywrightCli)}, ...forwardedArgs],
  { env: process.env, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
`,
  );
  writeFileSync(specFile, source);

  const partitionArgs = options.partition === "focused" ? [] : ["--standard-partition"];
  const callerConfigArgs =
    options.callerConfig === "separate"
      ? ["--config", hostileConfigFile]
      : options.callerConfig === "equals"
        ? [`--config=${hostileConfigFile}`]
        : options.callerConfig === "short-separate"
          ? ["-c", hostileConfigFile]
          : options.callerConfig === "short-equals"
            ? [`-c=${hostileConfigFile}`]
            : options.callerConfig === "short-attached"
              ? [`-c${hostileConfigFile}`]
              : [];
  const callerReporterArgs =
    options.callerReporter === "hostile" ? [`--reporter=${hostileReporterFile}`] : [];
  const result = spawnSync(
    process.execPath,
    [
      RUNNER,
      `--test-playwright-cli=${bridgeFile}`,
      ...partitionArgs,
      ...callerConfigArgs,
      ...(options.args ?? []),
      ...callerReporterArgs,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        NODE_ENV: "test",
        PW_TEST_REPORTER: options.environmentReporter === "hostile" ? hostileReporterFile : "",
      },
    },
  );

  return {
    bridgeRan: existsSync(bridgeMarkerFile),
    hostileConfigRan: existsSync(hostileConfigMarkerFile),
    output: `${result.stdout}\n${result.stderr}`,
    status: result.status,
  };
}

function normalizePlaywrightOutput(output: string) {
  const ansiEscapeSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
  return output.replaceAll(ansiEscapeSequence, "").replaceAll("\\", "/");
}

function playwrightSummaryCounts(output: string) {
  return normalizePlaywrightOutput(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /^\d+ (?:did not run|failed|flaky|interrupted|passed|skipped)(?: \([^)]+\))?$/.test(line),
    )
    .map((line) => line.replace(/ \([^)]+\)$/, ""));
}

function configFor(partition: "focused" | "standard" | "signed-delivery" | "storage") {
  const partitionFlags = {
    "signed-delivery": "--signed-delivery-partition",
    standard: "--standard-partition",
    storage: "--storage-partition",
  } as const;
  const { capture, status } = runRunner(
    [
      "--isolated-server",
      ...(partition === "focused" ? [] : [partitionFlags[partition]]),
      "--list",
    ],
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
  expect(capture.args).not.toContain("--standard-partition");
  expect(capture.args).not.toContain("--storage-partition");
  expect(capture.args).not.toContain("--signed-delivery-partition");
  expect(capture.args.some((arg) => arg.startsWith("--test-playwright-cli="))).toBe(false);
}

function expectReleaseReporterArgs(capture: Capture, expectedArgs: string[]) {
  expect(capture.args).toEqual([...expectedArgs, `--reporter=${RELEASE_REPORTER}`]);
}

function readPackageScripts() {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
}

function cliIt(name: string, callback: () => void) {
  it(name, callback, SUBPROCESS_TEST_TIMEOUT_MS);
}

const releaseConfigOverrideCases = [
  ["standard", "--standard-partition"],
  ["signed delivery", "--signed-delivery-partition"],
  ["storage", "--storage-partition"],
].flatMap(([partitionName, partitionFlag]) => [
  {
    configArgs: ["--config", "hostile-release-config.mjs"],
    formName: "long separate",
    partitionFlag,
    partitionName,
  },
  {
    configArgs: ["--config=hostile-release-config.mjs"],
    formName: "long equals",
    partitionFlag,
    partitionName,
  },
  {
    configArgs: ["-c", "hostile-release-config.mjs"],
    formName: "short separate",
    partitionFlag,
    partitionName,
  },
  {
    configArgs: ["-c=hostile-release-config.mjs"],
    formName: "short equals",
    partitionFlag,
    partitionName,
  },
  {
    configArgs: ["-chostile-release-config.mjs"],
    formName: "short attached",
    partitionFlag,
    partitionName,
  },
]);

describe("Playwright E2E partition contract", () => {
  cliIt("forbids focused tests only in release partitions", () => {
    expect(configFor("focused").forbidOnly).toBe(false);
    for (const partition of ["standard", "signed-delivery", "storage"] as const) {
      expect(configFor(partition).forbidOnly).toBe(true);
    }
  });

  cliIt("retries only focused browser tests", () => {
    const focusedConfig = configFor("focused");
    expect(focusedConfig.environment.PW_TEST_REPORTER).toBe(hostileEnvironment.PW_TEST_REPORTER);
    expect(focusedConfig.reporters).toEqual([]);
    expect(focusedConfig.retries).toBe(1);
    for (const partition of ["standard", "signed-delivery", "storage"] as const) {
      const releaseConfig = configFor(partition);
      expect(releaseConfig.environment.PW_TEST_REPORTER).toBeNull();
      expect(releaseConfig.reporters).toEqual(["./scripts/playwright-release-reporter.mjs"]);
      expect(releaseConfig.retries).toBe(0);
    }
  });

  cliIt("rejects a release run containing an actual test.only", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.only("controlled focused release test", () => {});
test("controlled non-focused release test", () => {});
`,
      { forbidOnly: configFor("standard").forbidOnly },
    );

    expect(result.status, result.output).toBe(1);
    expect(normalizePlaywrightOutput(result.output)).toContain(
      "item focused with '.only' is not allowed due to the 'forbidOnly' option",
    );
  });

  cliIt("preserves test.only behavior for a focused run", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.only("controlled focused local test", () => {});
test("controlled non-focused local test", () => {});
`,
      { forbidOnly: configFor("focused").forbidOnly, partition: "focused" },
    );

    expect(result.status, result.output).toBe(0);
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 passed"]);
  });

  cliIt("rejects a release run with an actual skipped Playwright result", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.skip("controlled skipped release test", () => {});
`,
    );

    expect(result.status, result.output).toBe(1);
    expect(normalizePlaywrightOutput(result.output)).toContain(
      "Skipped release test: release-gate.spec.mjs:3:6 › controlled skipped release test",
    );
    expect(normalizePlaywrightOutput(result.output)).toContain(
      "Release browser gate rejected: 1 skipped; 0 retried or flaky.",
    );
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 skipped"]);
  });

  cliIt("rejects a skipped release result despite a hostile environment reporter", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.skip("hostile reporter skipped release test", () => {});
`,
      { environmentReporter: "hostile" },
    );

    expect(result.status, result.output).toBe(1);
    expect(result.output).not.toContain(HOSTILE_REPORTER_MARKER);
    expect(normalizePlaywrightOutput(result.output)).toContain(
      "Skipped release test: release-gate.spec.mjs:3:6 › hostile reporter skipped release test",
    );
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 skipped"]);
  });

  cliIt("rejects a release run with an actual flaky retry result", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled flaky release test", ({}, testInfo) => {
  if (testInfo.retry === 0) throw new Error("controlled first-attempt failure");
});
`,
      { args: ["--retries=1"] },
    );

    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("Release browser gate rejected");
    expect(result.output).toContain("1 retried or flaky");
  });

  cliIt("accepts a release run with only passing non-retried Playwright results", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled passing release test", () => {});
`,
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).not.toContain("Release browser gate rejected");
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 passed"]);
  });

  cliIt("preserves ordinary Playwright failure diagnostics", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled ordinary release failure", () => {
  throw new Error("controlled ordinary failure detail");
});
`,
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(1);
    expect(output).toContain("release-gate.spec.mjs:3:1 › controlled ordinary release failure");
    expect(output).toContain("Error: controlled ordinary failure detail");
    expect(output).not.toContain("Release browser gate rejected");
    expect(playwrightSummaryCounts(output)).toEqual(["1 failed"]);
  });

  cliIt("identifies a completed skip in a mixed failed release run", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled mixed ordinary failure", () => {
  throw new Error("controlled mixed ordinary failure detail");
});

test.skip("controlled mixed skipped release test", () => {});
`,
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(1);
    expect(output).toContain("Error: controlled mixed ordinary failure detail");
    expect(output).toContain(
      "Skipped release test: release-gate.spec.mjs:7:6 › controlled mixed skipped release test",
    );
    expect(output).toContain("Release browser gate rejected: 1 skipped; 0 retried or flaky.");
    expect(playwrightSummaryCounts(output)).toEqual(["1 failed", "1 skipped"]);
  });

  cliIt("does not classify a serial did-not-run placeholder as an explicit skip", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.describe.serial("controlled serial release suite", () => {
  test("controlled serial ordinary failure", () => {
    throw new Error("controlled serial failure detail");
  });

  test("controlled serial did not run", () => {});
});
`,
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(1);
    expect(output).toContain("Error: controlled serial failure detail");
    expect(output).not.toContain("Skipped release test");
    expect(output).not.toContain("Release browser gate rejected: 1 skipped");
    expect(playwrightSummaryCounts(output)).toEqual(["1 failed", "1 did not run"]);
  });

  cliIt("accepts a completed expected failure without a skip diagnostic", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled expected release failure", () => {
  test.fail();
  throw new Error("controlled expected failure detail");
});
`,
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(0);
    expect(output).not.toContain("Skipped release test");
    expect(output).not.toContain("Release browser gate rejected");
    expect(playwrightSummaryCounts(output)).toEqual(["1 passed"]);
  });

  cliIt("rejects an ordinary failure despite a hostile caller reporter", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("hostile caller ordinary release failure", () => {
  throw new Error("hostile caller ordinary failure detail");
});
`,
      { callerReporter: "hostile" },
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(1);
    expect(output).not.toContain(HOSTILE_REPORTER_MARKER);
    expect(output).toContain("release-gate.spec.mjs:3:1 › hostile caller ordinary release failure");
    expect(output).toContain("Error: hostile caller ordinary failure detail");
    expect(playwrightSummaryCounts(output)).toEqual(["1 failed"]);
  });

  cliIt("rejects before a hostile separate-argument config can restore an ordinary failure", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("hostile config ordinary release failure", () => {
  throw new Error("hostile config ordinary failure detail");
});
`,
      { callerConfig: "separate" },
    );

    expect(result.status, result.output).toBe(1);
    expect(result.bridgeRan).toBe(false);
    expect(result.hostileConfigRan).toBe(false);
    expect(result.output).toContain(RELEASE_CONFIG_ERROR);
    expect(result.output).not.toContain(HOSTILE_REPORTER_MARKER);
  });

  cliIt("rejects before a hostile equals config can restore an explicit skip", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.skip("hostile config skipped release test", () => {});
`,
      { callerConfig: "equals" },
    );

    expect(result.status, result.output).toBe(1);
    expect(result.bridgeRan).toBe(false);
    expect(result.hostileConfigRan).toBe(false);
    expect(result.output).toContain(RELEASE_CONFIG_ERROR);
    expect(result.output).not.toContain(HOSTILE_REPORTER_MARKER);
  });

  cliIt("rejects an attached short config before its executable module can run", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("hostile attached short config release failure", () => {
  throw new Error("hostile attached short config failure detail");
});
`,
      { callerConfig: "short-attached" },
    );

    expect(result.status, result.output).toBe(1);
    expect(result.bridgeRan).toBe(false);
    expect(result.hostileConfigRan).toBe(false);
    expect(result.output).toContain(RELEASE_CONFIG_ERROR);
    expect(result.output).not.toContain(HOSTILE_REPORTER_MARKER);
  });

  cliIt("runs a real release fixture with a dash-prefixed grep value", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled -critical grep release test", () => {});
test("controlled unmatched grep release test", () => {});
`,
      { args: ["--grep", "-critical"] },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.bridgeRan).toBe(true);
    expect(result.output).not.toContain(RELEASE_CONFIG_ERROR);
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 passed"]);
  });

  cliIt("runs a real release fixture with a dash-prefixed positional filter", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("controlled positional release test", () => {});
`,
      { args: ["--", "-critical"], specFileName: "release-critical.spec.mjs" },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.bridgeRan).toBe(true);
    expect(result.output).not.toContain(RELEASE_CONFIG_ERROR);
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 passed"]);
  });

  cliIt("rejects a timed-out result despite a hostile caller reporter", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("hostile caller timed-out release test", async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});
`,
      { args: ["--timeout=50"], callerReporter: "hostile" },
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(1);
    expect(output).not.toContain(HOSTILE_REPORTER_MARKER);
    expect(output).toContain("hostile caller timed-out release test");
    expect(output).toContain("Test timeout of 50ms exceeded");
    expect(playwrightSummaryCounts(output)).toEqual(["1 failed"]);
  });

  cliIt("rejects an interrupted result despite a hostile caller reporter", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test("hostile caller interrupted release test", async ({}, testInfo) => {
  testInfo._interrupt();
  await new Promise((resolve) => setTimeout(resolve, 10));
});
`,
      { callerReporter: "hostile" },
    );
    const output = normalizePlaywrightOutput(result.output);

    expect(result.status, result.output).toBe(1);
    expect(output).not.toContain(HOSTILE_REPORTER_MARKER);
    expect(output).toContain("hostile caller interrupted release test");
    expect(output).not.toContain("Skipped release test");
    expect(output).toContain("Release browser gate rejected: 1 failed, timed out, or interrupted.");
    expect(playwrightSummaryCounts(output)).toEqual(["1 interrupted"]);
  });

  cliIt("preserves inherited environment reporter behavior for focused runs", () => {
    const result = runActualPlaywrightFixture(
      `import { test } from "@playwright/test";

test.skip("controlled focused skipped test", () => {});
`,
      { environmentReporter: "hostile", partition: "focused" },
    );

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(HOSTILE_REPORTER_MARKER);
    expect(result.output).not.toContain("Release browser gate rejected");
    expect(playwrightSummaryCounts(result.output)).toEqual(["1 skipped"]);
  });

  it("runs the production release partitions without application 2FA", () => {
    const scripts = readPackageScripts().scripts;

    expect(scripts["test:e2e"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:signed-delivery && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:release"]).toBe(
      "npm run test:e2e:standard && npm run test:e2e:signed-delivery && npm run test:e2e:storage",
    );
    expect(scripts["test:e2e:standard"]).toContain("--next-start");
    expect(scripts["test:e2e:signed-delivery"]).toBe(
      "node scripts/playwright-test.mjs --isolated-server --signed-delivery-partition --next-start e2e/storage/signed-file-delivery.spec.ts",
    );
    expect(scripts["test:e2e:admin-2fa"]).toBeUndefined();
    expect(scripts["test:e2e:initial-admin-2fa"]).toBeUndefined();
    expect(scripts["test:e2e:focused"]).toBe("node scripts/playwright-test.mjs --isolated-server");

    const source = readFileSync(RUNNER, "utf8");
    const adminSmokeSource = readFileSync(ADMIN_SMOKE, "utf8");
    expect(source).not.toContain("admin-2fa");
    expect(source).not.toContain("E2E_ADMIN_REQUIRE_2FA");
    expect(source).not.toContain("ADMIN_REQUIRE_2FA");
    expect(adminSmokeSource).not.toContain("ADMIN_REQUIRE_2FA");
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

  cliIt("preserves the standard partition next-start command", () => {
    const { capture, status } = runRunner([
      "--isolated-server",
      "--standard-partition",
      "--next-start",
      "--list",
    ]);

    expect(status).toBe(0);
    expectIsolatedServer(capture);
    expect(capture.environment).toMatchObject({
      E2E_PARTITION: "standard",
      E2E_PLAYWRIGHT_SERVER_COMMAND: "npx next start",
    });
    expectReleaseReporterArgs(capture, ["test", "--list"]);
    expectWrapperFlagsRemoved(capture);
  });

  cliIt("forces storage policy and local storage without retaining hostile server commands", () => {
    const { capture, status } = runRunner([
      "--isolated-server",
      "--storage-partition",
      "e2e/portals/teacher-materials.spec.ts",
    ]);

    expect(status).toBe(0);
    expectIsolatedServer(capture);
    expect(capture.environment).toMatchObject({
      E2E_PARTITION: "storage",
      E2E_PLAYWRIGHT_SERVER_COMMAND: null,
      STORAGE_DRIVER: "local",
    });
    expectReleaseReporterArgs(capture, ["test", "e2e/portals/teacher-materials.spec.ts"]);
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
        E2E_PARTITION: "signed-delivery",
        E2E_PLAYWRIGHT_SERVER_COMMAND: "npx next start",
        ...signedDeliveryEnvironment,
      });
      expect(capture.webServerEnvironment).toMatchObject(signedDeliveryEnvironment);
      expectReleaseReporterArgs(capture, ["test", "e2e/storage/signed-file-delivery.spec.ts"]);
      expectWrapperFlagsRemoved(capture);
    },
  );

  cliIt("propagates the Playwright child numeric exit code", () => {
    const { capture, status } = runRunner(
      ["--isolated-server", "--standard-partition", "--next-start"],
      { PLAYWRIGHT_TEST_EXIT_CODE: "23" },
    );

    expectWrapperFlagsRemoved(capture);
    expectReleaseReporterArgs(capture, ["test"]);
    expect(status).toBe(23);
  });

  cliIt("replaces an explicit release reporter with the enforced reporter", () => {
    const { capture, status } = runRunner(["--standard-partition", "--list", "--reporter=line"]);

    expect(status).toBe(0);
    expect(capture.args).toEqual(["test", "--list", `--reporter=${RELEASE_REPORTER}`]);
    expectWrapperFlagsRemoved(capture);
  });

  it.each(releaseConfigOverrideCases)(
    "rejects the $partitionName release partition $formName config form before Playwright spawn",
    ({ configArgs, partitionFlag }) => {
      const { captureFile, result } = invokeRunner([partitionFlag, ...configArgs, "--list"]);

      expect(result.status).toBe(1);
      expect(existsSync(captureFile)).toBe(false);
      expect(result.stderr).toContain(RELEASE_CONFIG_ERROR);
      expect(result.stderr).not.toContain("hostile-release-config.mjs");
    },
    SUBPROCESS_TEST_TIMEOUT_MS,
  );

  cliIt("forwards a dash-prefixed mandatory option value in a release run", () => {
    const { capture, status } = runRunner([
      "--standard-partition",
      "--grep",
      "-critical",
      "--list",
    ]);

    expect(status).toBe(0);
    expectReleaseReporterArgs(capture, ["test", "--grep", "-critical", "--list"]);
    expectWrapperFlagsRemoved(capture);
  });

  cliIt("forwards a dash-prefixed positional filter after the option terminator", () => {
    const { capture, status } = runRunner(["--standard-partition", "--", "-critical"]);

    expect(status).toBe(0);
    expect(capture.args).toEqual(["test", `--reporter=${RELEASE_REPORTER}`, "--", "-critical"]);
    expectWrapperFlagsRemoved(capture);
  });

  it.each([
    ["long separate config", ["--config", "focused-config.mjs"]],
    ["long equals config", ["--config=focused-config.mjs"]],
    ["short separate config", ["-c", "focused-config.mjs"]],
    ["short equals config", ["-c=focused-config.mjs"]],
    ["short attached config", ["-cfocused-config.mjs"]],
    ["dash-prefixed grep value", ["--grep", "-critical"]],
    ["dash-prefixed positional filter", ["--", "-critical"]],
  ])(
    "forwards focused $0 arguments unchanged",
    (_formName, configArgs) => {
      const { capture, status } = runRunner([...configArgs, "--list"]);

      expect(status).toBe(0);
      expect(capture.args).toEqual(["test", ...configArgs, "--list"]);
      expect(capture.args).not.toContain(`--reporter=${RELEASE_REPORTER}`);
    },
    SUBPROCESS_TEST_TIMEOUT_MS,
  );

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
