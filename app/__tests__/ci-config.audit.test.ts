import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = process.cwd();
const workflowPath = join(root, ".github/workflows/ci.yml");
const workflow = readFileSync(workflowPath, "utf8");
const seedTest = readFileSync(join(root, "prisma/__tests__/seed.test.ts"), "utf8");
const storagePostgresTest = readFileSync(
  join(root, "tests/repositories/file-access-repository.postgres.test.ts"),
  "utf8",
);
const verifyDatabaseSource = readFileSync(join(root, "prisma/verify-db.ts"), "utf8");
const seedIntegrationFlag = "RUN_SEED_DB_INTEGRATION";
const storagePostgresIntegrationFlag = "RUN_S3_POSTGRES_INTEGRATION";
const retiredAdminTwoFactorPostgresIntegrationFlag = "RUN_ADMIN_TWO_FACTOR_CHALLENGE_POSTGRES";
const task3PostgresIntegrationFlag = "RUN_TASK3_POSTGRES_INTEGRATION";
const integrationFlags = [
  seedIntegrationFlag,
  storagePostgresIntegrationFlag,
  task3PostgresIntegrationFlag,
] as const;
const verifyJobTimeoutMinutes = 180;
const requiredRunCommands = [
  "npm ci",
  "npx playwright install --with-deps chromium",
  "npx prisma generate",
  "npx prisma validate",
  "npx prisma migrate deploy",
  "npx prisma migrate status",
  "npm run db:seed",
  "npm run db:verify",
  "npm run lint",
  "npm run typecheck",
  "npm run test",
  "npm run build",
  "npm run db:seed",
  "npm run test:e2e:release",
];

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asSteps(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new Error("verify job steps must be an array");
  }

  return value.map((step, index) => asRecord(step, `verify job step ${index + 1}`));
}

function assertEqual(value: unknown, expected: unknown, message: string) {
  if (value !== expected) {
    throw new Error(`${message}; expected ${JSON.stringify(expected)}`);
  }
}

function assertDatabaseUrl(value: unknown, name: string) {
  if (typeof value !== "string" || value.includes("${{") || value.includes("onrender.com")) {
    throw new Error(`${name} must be a literal database URL`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid literal database URL`);
  }

  assertEqual(url.protocol, "postgresql:", `${name} must use PostgreSQL`);
  assertEqual(url.hostname, "localhost", `${name} must use localhost`);
  assertEqual(url.port, "5432", `${name} must use port 5432`);
  assertEqual(url.pathname, "/ulu_school_test", `${name} must use the disposable database`);
  assertEqual(url.searchParams.get("schema"), "public", `${name} must use the public schema`);
}

function parseDockerOptions(options: unknown): Map<string, string> {
  if (typeof options !== "string") {
    throw new Error("PostgreSQL service options must be a string");
  }

  const tokens = options.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const parsedOptions = new Map<string, string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const option = tokens[index];
    if (!option.startsWith("--")) {
      continue;
    }

    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`PostgreSQL service ${option} must include a value`);
    }

    if (parsedOptions.has(option)) {
      throw new Error(`PostgreSQL service ${option} must not be repeated`);
    }

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    parsedOptions.set(option, isQuoted ? value.slice(1, -1) : value);
    index += 1;
  }

  return parsedOptions;
}

function assertPostgresHealthOptions(options: unknown) {
  const parsedOptions = parseDockerOptions(options);
  const requiredOptions = {
    "--health-cmd": "pg_isready -U postgres -d ulu_school_test",
    "--health-interval": "10s",
    "--health-timeout": "5s",
    "--health-retries": "5",
  };

  for (const [option, expectedValue] of Object.entries(requiredOptions)) {
    assertEqual(
      parsedOptions.get(option),
      expectedValue,
      `PostgreSQL service ${option} must remain ${expectedValue}`,
    );
  }
}

function assertSeedTestGate(seedTestSource: string) {
  if (!seedTestSource.includes(`process.env.${seedIntegrationFlag} === "1"`)) {
    throw new Error(`seed integration suite must require ${seedIntegrationFlag}=1`);
  }

  if (
    !seedTestSource.includes("const suite = describe.skipIf(!runSeedDbIntegration);") ||
    !seedTestSource.includes('suite("Seed data - Teacher records"')
  ) {
    throw new Error("seed integration suite must be skipped unless its explicit flag is enabled");
  }
}

function assertStoragePostgresTestGate(storagePostgresTestSource: string) {
  if (
    !storagePostgresTestSource.includes(
      `const runPostgres = process.env.${storagePostgresIntegrationFlag} === "1";`,
    )
  ) {
    throw new Error(
      `file-access PostgreSQL source gate must consume ${storagePostgresIntegrationFlag}=1`,
    );
  }

  if (
    !storagePostgresTestSource.includes("const suite = describe.skipIf(!runPostgres);") ||
    !storagePostgresTestSource.includes('suite("file access PostgreSQL IDOR relations"')
  ) {
    throw new Error("file-access PostgreSQL source gate must skip the integration suite");
  }
}

function assertCiWorkflowContract(
  workflowSource: string,
  storagePostgresTestSource = storagePostgresTest,
) {
  if (workflowSource.includes(retiredAdminTwoFactorPostgresIntegrationFlag)) {
    throw new Error("CI workflow must not enable the retired application 2FA integration suite");
  }

  assertSeedTestGate(seedTest);
  assertStoragePostgresTestGate(storagePostgresTestSource);
  const parsedWorkflow = asRecord(parse(workflowSource), "workflow");
  const jobs = asRecord(parsedWorkflow.jobs, "workflow jobs");
  if (Object.keys(jobs).length !== 1 || !Object.hasOwn(jobs, "verify")) {
    throw new Error("CI workflow must retain exactly one verify job");
  }
  const verify = asRecord(jobs.verify, "verify job");
  const steps = asSteps(verify.steps);
  const permissions = asRecord(verify.permissions ?? parsedWorkflow.permissions, "CI permissions");
  const services = asRecord(verify.services, "verify job services");
  const postgres = asRecord(services.postgres, "PostgreSQL service");
  const postgresEnv = asRecord(postgres.env, "PostgreSQL service environment");
  const environment = asRecord(verify.env, "verify job environment");
  const workflowEnvironment =
    parsedWorkflow.env === undefined ? {} : asRecord(parsedWorkflow.env, "workflow environment");

  assertEqual(
    verify["timeout-minutes"],
    verifyJobTimeoutMinutes,
    `verify job timeout must remain ${verifyJobTimeoutMinutes} minutes`,
  );

  const nodeSetup = steps.find((step) => step.uses === "actions/setup-node@v4");
  if (!nodeSetup) {
    throw new Error("verify job must configure Node with actions/setup-node@v4");
  }

  const nodeSetupOptions = asRecord(nodeSetup.with, "Node setup options");
  assertEqual(nodeSetupOptions["node-version-file"], ".nvmrc", "Node setup must read .nvmrc");
  if (Object.keys(permissions).length !== 1 || permissions.contents !== "read") {
    throw new Error('CI permissions must be exactly { contents: "read" }');
  }

  assertEqual(postgres.image, "postgres:16", "PostgreSQL service image must remain postgres:16");
  assertEqual(
    postgresEnv.POSTGRES_DB,
    "ulu_school_test",
    "PostgreSQL service must use the disposable database",
  );

  assertPostgresHealthOptions(postgres.options);

  assertDatabaseUrl(environment.DATABASE_URL, "DATABASE_URL");
  assertDatabaseUrl(environment.DIRECT_URL, "DIRECT_URL");
  assertDatabaseUrl(environment.E2E_DATABASE_URL, "E2E_DATABASE_URL");
  assertDatabaseUrl(environment.E2E_DIRECT_URL, "E2E_DIRECT_URL");
  assertEqual(
    environment.E2E_DATABASE_RESET_ALLOWED,
    "1",
    "CI must set E2E_DATABASE_RESET_ALLOWED for its disposable E2E database",
  );

  for (const integrationFlag of integrationFlags) {
    if (
      Object.hasOwn(workflowEnvironment, integrationFlag) ||
      Object.hasOwn(environment, integrationFlag)
    ) {
      throw new Error(`${integrationFlag} must be enabled only on the post-seed test step`);
    }
  }

  const runCommands = steps.flatMap((step) => (typeof step.run === "string" ? [step.run] : []));
  for (const command of requiredRunCommands) {
    if (!runCommands.includes(command)) {
      throw new Error(`verify job must run ${command}`);
    }
  }

  let previousIndex = -1;
  const commandIndexes = requiredRunCommands.map((command) => {
    const index = runCommands.findIndex(
      (runCommand, runCommandIndex) => runCommandIndex > previousIndex && runCommand === command,
    );
    if (index === -1) {
      throw new Error("verify job run commands must remain in the required order");
    }

    previousIndex = index;
    return index;
  });

  for (let index = 1; index < commandIndexes.length; index += 1) {
    if (commandIndexes[index] <= commandIndexes[index - 1]) {
      throw new Error("verify job run commands must remain in the required order");
    }
  }

  const testStep = steps.find((step) => step.run === "npm run test");
  if (!testStep) {
    throw new Error("verify job must include the full test step");
  }
  const testEnvironment = asRecord(testStep.env, "full test step environment");
  for (const integrationFlag of integrationFlags) {
    assertEqual(
      testEnvironment[integrationFlag],
      "1",
      `full test step must enable ${integrationFlag}`,
    );
  }

  for (const step of steps) {
    if (step === testStep || step.env === undefined) continue;
    const stepEnvironment = asRecord(step.env, "verify step environment");
    for (const integrationFlag of integrationFlags) {
      if (Object.hasOwn(stepEnvironment, integrationFlag)) {
        throw new Error(`${integrationFlag} must be enabled only on the post-seed test step`);
      }
    }
  }
}

describe("GitHub CI production-readiness contract", () => {
  it("accepts the checked-in workflow with Node 22", () => {
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();

    expect(nvmrc).toBe("22");
    expect(() => assertCiWorkflowContract(workflow)).not.toThrow();
  });

  it("keeps one sequential verify job with a 180-minute timeout", () => {
    const parsedWorkflow = asRecord(parse(workflow), "workflow");
    const jobs = asRecord(parsedWorkflow.jobs, "workflow jobs");
    const verify = asRecord(jobs.verify, "verify job");

    expect(Object.keys(jobs)).toEqual(["verify"]);
    expect(verify["timeout-minutes"]).toBe(verifyJobTimeoutMinutes);

    const shortenedTimeout = workflow.replace(
      `timeout-minutes: ${verifyJobTimeoutMinutes}`,
      "timeout-minutes: 30",
    );
    expect(shortenedTimeout).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(shortenedTimeout)).toThrow(/180 minutes/i);
  });

  it.each([task3PostgresIntegrationFlag])(
    "enables %s only on the full test step",
    (integrationFlag) => {
      const parsedWorkflow = asRecord(parse(workflow), "workflow");
      const verify = asRecord(asRecord(parsedWorkflow.jobs, "workflow jobs").verify, "verify job");
      const steps = asSteps(verify.steps);
      const testStep = steps.find((step) => step.run === "npm run test");

      expect(testStep).toBeDefined();
      expect(asRecord(testStep?.env, "full test step environment")[integrationFlag]).toBe("1");

      const removedFlag = workflow.replace(`          ${integrationFlag}: "1"\n`, "");
      expect(removedFlag).not.toBe(workflow);
      expect(() => assertCiWorkflowContract(removedFlag)).toThrow(
        new RegExp(`full test step must enable ${integrationFlag}`),
      );
    },
  );

  it("rejects enabling seed integration before deterministic seeding", () => {
    const earlySeedIntegration = workflow.replace(
      "permissions:\n",
      `env:\n  ${seedIntegrationFlag}: "1"\n\npermissions:\n`,
    );

    expect(earlySeedIntegration).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(earlySeedIntegration)).toThrow(/post-seed test step/i);
  });

  it("enables the file-access PostgreSQL IDOR matrix only on the post-seed test step", () => {
    const parsedWorkflow = asRecord(parse(workflow), "workflow");
    const verify = asRecord(asRecord(parsedWorkflow.jobs, "workflow jobs").verify, "verify job");
    const steps = asSteps(verify.steps);
    const testStep = steps.find((step) => step.run === "npm run test");

    expect(testStep).toBeDefined();
    expect(
      asRecord(testStep?.env, "full test step environment")[storagePostgresIntegrationFlag],
    ).toBe("1");
    expect(asRecord(verify.env, "verify job environment")).not.toHaveProperty(
      storagePostgresIntegrationFlag,
    );
    expect(
      steps
        .filter((step) => step !== testStep)
        .map((step) => asRecord(step.env ?? {}, "verify step environment")),
    ).not.toContainEqual(
      expect.objectContaining({ [storagePostgresIntegrationFlag]: expect.anything() }),
    );
  });

  it.each([
    [
      "removed",
      storagePostgresTest.replace(
        `const runPostgres = process.env.${storagePostgresIntegrationFlag} === "1";`,
        "const runPostgres = false;",
      ),
    ],
    ["renamed", storagePostgresTest.replaceAll(storagePostgresIntegrationFlag, "RUN_RENAMED")],
  ])("rejects a %s file-access PostgreSQL source gate", (_mutation, mutatedSource) => {
    expect(mutatedSource).not.toBe(storagePostgresTest);
    expect(() => assertCiWorkflowContract(workflow, mutatedSource)).toThrow(/source gate/i);
  });

  it.each([
    [
      "workflow",
      workflow.replace(
        "permissions:\n",
        `env:\n  ${storagePostgresIntegrationFlag}: "1"\n\npermissions:\n`,
      ),
    ],
    [
      "verify job",
      workflow.replace(
        "    env:\n      DATABASE_URL:",
        `    env:\n      ${storagePostgresIntegrationFlag}: "1"\n      DATABASE_URL:`,
      ),
    ],
    [
      "Lint step",
      workflow.replace(
        "      - name: Lint\n        run: npm run lint",
        `      - name: Lint\n        env:\n          ${storagePostgresIntegrationFlag}: "1"\n        run: npm run lint`,
      ),
    ],
  ])(
    "rejects enabling file-access PostgreSQL integration on the %s",
    (_location, mutatedWorkflow) => {
      expect(mutatedWorkflow).not.toBe(workflow);
      expect(() => assertCiWorkflowContract(mutatedWorkflow)).toThrow(/post-seed test step/i);
    },
  );

  it("rejects an expression-backed database URL", () => {
    const expressionBackedDatabaseUrl = workflow.replace(
      "DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ulu_school_test?schema=public",
      "DATABASE_URL: ${{ secrets.DATABASE_URL }}",
    );

    expect(expressionBackedDatabaseUrl).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(expressionBackedDatabaseUrl)).toThrow(/database url/i);
  });

  it("requires explicit E2E URLs and reset opt-in for the disposable CI service", () => {
    for (const key of [
      "E2E_DATABASE_URL",
      "E2E_DIRECT_URL",
      "E2E_DATABASE_RESET_ALLOWED",
    ] as const) {
      const withoutKey = workflow.replace(new RegExp(`^      ${key}:.*\\r?\\n`, "m"), "");

      expect(withoutKey).not.toBe(workflow);
      expect(() => assertCiWorkflowContract(withoutKey)).toThrow(
        new RegExp(key.replaceAll("_", ".*"), "i"),
      );
    }
  });

  it("rejects migration and seed commands in the wrong order", () => {
    const reorderedCommands = workflow
      .replace("run: npx prisma migrate deploy", "run: __MIGRATE__")
      .replace("run: npm run db:seed", "run: npx prisma migrate deploy")
      .replace("run: __MIGRATE__", "run: npm run db:seed");

    expect(reorderedCommands).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(reorderedCommands)).toThrow(/order/i);
  });

  it("keeps database verification schema-sensitive without running migration commands", () => {
    expect(verifyDatabaseSource).toContain("prisma.enquiry.findFirst");
    expect(verifyDatabaseSource).toContain("consentVersion: true");
    expect(verifyDatabaseSource).toContain("prisma.pendingUpload.findFirst");
    expect(verifyDatabaseSource).toContain("claimedAt: true");
    expect(verifyDatabaseSource).not.toMatch(/migrate\s+(?:deploy|status)|child_process|execSync/);
  });

  it("rejects additional write permissions", () => {
    const writePermission = workflow.replace(
      "contents: read",
      "contents: read\n  pull-requests: write",
    );

    expect(writePermission).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(writePermission)).toThrow(/permissions/i);
  });

  it("rejects pg_isready text that is not a health command", () => {
    const unrelatedReadinessText = workflow.replace(
      '--health-cmd "pg_isready -U postgres -d ulu_school_test"',
      '--label "pg_isready -U postgres -d ulu_school_test"',
    );

    expect(unrelatedReadinessText).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(unrelatedReadinessText)).toThrow(/health-cmd/i);
  });
});
