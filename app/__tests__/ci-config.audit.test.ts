import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = process.cwd();
const workflowPath = join(root, ".github/workflows/ci.yml");
const workflow = readFileSync(workflowPath, "utf8");
const requiredRunCommands = [
  "npm ci",
  "npx prisma generate",
  "npx prisma validate",
  "npx prisma migrate deploy",
  "npm run db:seed",
  "npm run lint",
  "npm run typecheck",
  "npm run test",
  "npm run build",
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

function assertCiWorkflowContract(workflowSource: string) {
  const parsedWorkflow = asRecord(parse(workflowSource), "workflow");
  const jobs = asRecord(parsedWorkflow.jobs, "workflow jobs");
  const verify = asRecord(jobs.verify, "verify job");
  const steps = asSteps(verify.steps);
  const permissions = asRecord(verify.permissions ?? parsedWorkflow.permissions, "CI permissions");
  const services = asRecord(verify.services, "verify job services");
  const postgres = asRecord(services.postgres, "PostgreSQL service");
  const postgresEnv = asRecord(postgres.env, "PostgreSQL service environment");
  const environment = asRecord(verify.env, "verify job environment");

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

  const runCommands = steps.flatMap((step) => (typeof step.run === "string" ? [step.run] : []));
  const commandIndexes = requiredRunCommands.map((command) => {
    const index = runCommands.indexOf(command);
    if (index === -1) {
      throw new Error(`verify job must run ${command}`);
    }

    return index;
  });

  for (let index = 1; index < commandIndexes.length; index += 1) {
    if (commandIndexes[index] <= commandIndexes[index - 1]) {
      throw new Error("verify job run commands must remain in the required order");
    }
  }
}

describe("GitHub CI production-readiness contract", () => {
  it("accepts the checked-in workflow with Node 22", () => {
    const nvmrc = readFileSync(join(root, ".nvmrc"), "utf8").trim();

    expect(nvmrc).toBe("22");
    expect(() => assertCiWorkflowContract(workflow)).not.toThrow();
  });

  it("rejects an expression-backed database URL", () => {
    const expressionBackedDatabaseUrl = workflow.replace(
      "DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ulu_school_test?schema=public",
      "DATABASE_URL: ${{ secrets.DATABASE_URL }}",
    );

    expect(expressionBackedDatabaseUrl).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(expressionBackedDatabaseUrl)).toThrow(/database url/i);
  });

  it("rejects migration and seed commands in the wrong order", () => {
    const reorderedCommands = workflow
      .replace("run: npx prisma migrate deploy", "run: __MIGRATE__")
      .replace("run: npm run db:seed", "run: npx prisma migrate deploy")
      .replace("run: __MIGRATE__", "run: npm run db:seed");

    expect(reorderedCommands).not.toBe(workflow);
    expect(() => assertCiWorkflowContract(reorderedCommands)).toThrow(/order/i);
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
