import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  const source = normalized.split("*").map(escapeRegExp).join("[^/]*");
  return new RegExp(`^${source}$`);
}

function staticSearchRoot(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  const wildcardIndex = normalized.search(/[*?]/);
  if (wildcardIndex === -1) return path.dirname(normalized);
  const prefix = normalized.slice(0, wildcardIndex);
  const slashIndex = prefix.lastIndexOf("/");
  return slashIndex === -1 ? "." : prefix.slice(0, slashIndex);
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return walkFiles(fullPath);
    return [fullPath];
  });
}

function expandArg(arg) {
  if (arg.startsWith("-") || !arg.includes("*")) return [arg];

  const matcher = globToRegExp(arg);
  const root = staticSearchRoot(arg);
  const matches = walkFiles(root)
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => matcher.test(file))
    .sort();

  return matches.length > 0 ? matches : [arg];
}

function withReleaseReporter(args, reporterPath) {
  const forwardedArgs = [];
  let configuredReporters = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--reporter") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--reporter requires a reporter value.");
      }
      configuredReporters = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--reporter=")) {
      configuredReporters = arg.slice("--reporter=".length);
      if (!configuredReporters) throw new Error("--reporter requires a reporter value.");
      continue;
    }
    forwardedArgs.push(arg);
  }

  const reporters = configuredReporters ? `${configuredReporters},${reporterPath}` : reporterPath;
  return [...forwardedArgs, `--reporter=${reporters}`];
}

function portFromBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.port) return url.port;
    if (url.protocol === "http:") return "80";
    if (url.protocol === "https:") return "443";
  } catch {
    return null;
  }
  return null;
}

function findFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "localhost", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error("Unable to allocate a local Playwright port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function ensureBaseUrl() {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    const port = portFromBaseUrl(process.env.PLAYWRIGHT_BASE_URL);
    if (port) process.env.PORT = port;
    return;
  }

  if (process.env.PORT) {
    process.env.PLAYWRIGHT_BASE_URL = `http://localhost:${process.env.PORT}`;
    return;
  }

  const port = await findFreeLocalPort();
  process.env.PORT = String(port);
  process.env.PLAYWRIGHT_BASE_URL = `http://localhost:${port}`;
}

const isolatedServerFlag = "--isolated-server";
const nextStartFlag = "--next-start";
const testPlaywrightCliFlagPrefix = "--test-playwright-cli=";
const partitionFlags = new Map([
  ["--standard-partition", "standard"],
  ["--storage-partition", "storage"],
  ["--admin-2fa-partition", "admin-2fa"],
  ["--signed-delivery-partition", "signed-delivery"],
]);
const rawArgs = process.argv.slice(2);
const testPlaywrightCliFlags = rawArgs.filter((arg) => arg.startsWith(testPlaywrightCliFlagPrefix));

if (testPlaywrightCliFlags.length > 1) {
  throw new Error("Only one --test-playwright-cli flag can be selected at a time.");
}

const testPlaywrightCliFlag = testPlaywrightCliFlags[0];
const testPlaywrightCli = testPlaywrightCliFlag?.slice(testPlaywrightCliFlagPrefix.length);

if (testPlaywrightCliFlag && process.env.NODE_ENV !== "test") {
  throw new Error("--test-playwright-cli is only available when NODE_ENV=test.");
}

if (testPlaywrightCliFlag && (!testPlaywrightCli || !path.isAbsolute(testPlaywrightCli))) {
  throw new Error("--test-playwright-cli requires an absolute CLI path.");
}

const selectedPartitions = rawArgs
  .filter((arg) => partitionFlags.has(arg))
  .map((arg) => partitionFlags.get(arg));

if (selectedPartitions.length > 1) {
  throw new Error("Only one Playwright E2E partition can be selected at a time.");
}

const partition = selectedPartitions[0] ?? "focused";
const releaseReporterPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "playwright-release-reporter.mjs",
);
const usesIsolatedServer = rawArgs.includes(isolatedServerFlag) || partition !== "focused";
const usesNextStart = rawArgs.includes(nextStartFlag);
const expandedArgs = rawArgs
  .filter(
    (arg) =>
      arg !== isolatedServerFlag &&
      arg !== nextStartFlag &&
      !partitionFlags.has(arg) &&
      !arg.startsWith(testPlaywrightCliFlagPrefix),
  )
  .flatMap(expandArg);

if (usesIsolatedServer) {
  Reflect.deleteProperty(process.env, "PLAYWRIGHT_BASE_URL");
  Reflect.deleteProperty(process.env, "PORT");
  Reflect.deleteProperty(process.env, "PLAYWRIGHT_SERVER_COMMAND");
  Reflect.deleteProperty(process.env, "E2E_PLAYWRIGHT_SERVER_COMMAND");
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER = "false";
}

await ensureBaseUrl();

if (usesIsolatedServer) {
  console.log(`Playwright isolated server: ${process.env.PLAYWRIGHT_BASE_URL} (reuse disabled).`);
}

const adminTwoFactorSpecPaths = new Set([
  "e2e/portals/admin-security.spec.ts",
  "e2e/portals/initial-admin-2fa.spec.ts",
]);
const adminTwoFactorRequired =
  partition === "admin-2fa" ||
  expandedArgs.some((arg) => adminTwoFactorSpecPaths.has(arg.replaceAll("\\", "/")));

process.env.E2E_ADMIN_REQUIRE_2FA = adminTwoFactorRequired ? "true" : "false";
process.env.ADMIN_REQUIRE_2FA = process.env.E2E_ADMIN_REQUIRE_2FA;
process.env.E2E_PARTITION = partition;
if (partition === "storage") process.env.STORAGE_DRIVER = "local";
if (partition === "signed-delivery") {
  Object.assign(process.env, {
    RUN_S4_SIGNED_DELIVERY_E2E: "1",
    STORAGE_DRIVER: "r2",
    R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "r2-access-key-value",
    R2_SECRET_ACCESS_KEY: "r2-secret-key-value",
    R2_BUCKET_NAME: "s4-private-files",
  });
}
if (usesNextStart) process.env.E2E_PLAYWRIGHT_SERVER_COMMAND = "npx next start";

const playwrightCli = testPlaywrightCli
  ? path.resolve(testPlaywrightCli)
  : path.resolve("node_modules", "@playwright", "test", "cli.js");
const playwrightArgs =
  partition === "focused" ? expandedArgs : withReleaseReporter(expandedArgs, releaseReporterPath);
const child = spawn(process.execPath, [playwrightCli, "test", ...playwrightArgs], {
  shell: false,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start Playwright: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
