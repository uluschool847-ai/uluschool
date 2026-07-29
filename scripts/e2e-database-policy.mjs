import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const databaseSuffixPattern = /_(?:test|e2e)$/i;
const preparationSteps = [
  { args: ["run", "db:reset", "--", "--skip-seed"], label: "reset" },
  { args: ["run", "db:deploy"], label: "migration" },
  { args: ["run", "db:seed"], label: "seed" },
];

function parseDatabaseUrl(environment, variableName) {
  const value = environment[variableName]?.trim();
  if (!value) {
    throw new Error(`${variableName} is required for Playwright E2E.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${variableName} must be a PostgreSQL URL.`);
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error(`${variableName} must contain a valid database name.`);
  }

  if (
    !allowedHosts.has(parsed.hostname) ||
    !databaseName ||
    databaseName.includes("/") ||
    !databaseSuffixPattern.test(databaseName)
  ) {
    throw new Error(
      `${variableName} must target a loopback database whose name ends in _test or _e2e.`,
    );
  }

  const schemaValues = parsed.searchParams.getAll("schema");
  if (schemaValues.length > 1) {
    throw new Error(`${variableName} must contain at most one Prisma schema.`);
  }
  const schemaName = (schemaValues[0]?.trim() || "public").normalize("NFC");

  return {
    databaseName,
    endpoint: `${parsed.hostname}:${parsed.port || "5432"}`,
    schemaName,
    value,
  };
}

export function loadProjectEnvironment(environment, projectDirectory = process.cwd()) {
  const explicitKeys = new Set(
    Object.entries(environment)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key),
  );
  const fileEnvironment = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(projectDirectory, fileName);
    if (existsSync(filePath)) {
      Object.assign(fileEnvironment, parseEnv(readFileSync(filePath, "utf8")));
    }
  }

  for (const [key, value] of Object.entries(fileEnvironment)) {
    if (!explicitKeys.has(key)) {
      environment[key] = value;
    }
  }

  return environment;
}

export function resolveE2EDatabaseEnvironment(environment) {
  const runtime = parseDatabaseUrl(environment, "E2E_DATABASE_URL");
  const direct = parseDatabaseUrl(environment, "E2E_DIRECT_URL");

  if (runtime.databaseName !== direct.databaseName) {
    throw new Error(
      "E2E_DATABASE_URL and E2E_DIRECT_URL must target the same disposable database.",
    );
  }

  if (runtime.endpoint !== direct.endpoint) {
    throw new Error("E2E_DATABASE_URL and E2E_DIRECT_URL must target the same loopback endpoint.");
  }

  if (runtime.schemaName !== direct.schemaName) {
    throw new Error("E2E_DATABASE_URL and E2E_DIRECT_URL must target the same Prisma schema.");
  }

  if (environment.E2E_DATABASE_RESET_ALLOWED !== "1") {
    throw new Error("E2E database reset requires E2E_DATABASE_RESET_ALLOWED=1.");
  }

  return {
    ...environment,
    DATABASE_URL: runtime.value,
    DIRECT_URL: direct.value,
  };
}

export function resolveNpmCliPath(
  environment,
  nodeExecutable = process.execPath,
  fileExists = existsSync,
) {
  const npmRelativePath = path.join("node_modules", "npm", "bin", "npm-cli.js");
  const nodeDirectory = path.dirname(nodeExecutable);
  const candidates = [
    environment.npm_execpath,
    environment.npm_config_prefix
      ? path.join(environment.npm_config_prefix, npmRelativePath)
      : undefined,
    path.join(nodeDirectory, npmRelativePath),
    path.resolve(nodeDirectory, "..", "lib", npmRelativePath),
    path.resolve(nodeDirectory, "..", npmRelativePath),
  ];

  const npmCliPath = candidates.find(
    (candidate) => candidate && path.isAbsolute(candidate) && fileExists(candidate),
  );
  if (!npmCliPath) {
    throw new Error("Unable to resolve the npm CLI required for E2E database preparation.");
  }

  return npmCliPath;
}

function executeWithNpm(step, environment) {
  const npmCliPath = resolveNpmCliPath(environment);

  return spawnSync(process.execPath, [npmCliPath, ...step], {
    encoding: "utf8",
    env: environment,
    shell: false,
  });
}

export function prepareE2EDatabase(environment, execute = executeWithNpm) {
  const isolatedEnvironment = resolveE2EDatabaseEnvironment(environment);

  for (const { args, label } of preparationSteps) {
    const result = execute(args, isolatedEnvironment);
    if (result.status !== 0) {
      throw new Error(`E2E database preparation failed during ${label}.`);
    }
  }

  return isolatedEnvironment;
}
