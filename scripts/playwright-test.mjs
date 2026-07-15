import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";

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
const rawArgs = process.argv.slice(2);
const usesIsolatedServer = rawArgs.includes(isolatedServerFlag);
const expandedArgs = rawArgs.filter((arg) => arg !== isolatedServerFlag).flatMap(expandArg);

if (usesIsolatedServer) {
  Reflect.deleteProperty(process.env, "PLAYWRIGHT_BASE_URL");
  Reflect.deleteProperty(process.env, "PORT");
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER = "false";
}

await ensureBaseUrl();

if (usesIsolatedServer) {
  console.log(`Playwright isolated server: ${process.env.PLAYWRIGHT_BASE_URL} (reuse disabled).`);
}

const runsInitialAdminTwoFactorSpec = expandedArgs.some(
  (arg) => arg.replaceAll("\\", "/") === "e2e/portals/initial-admin-2fa.spec.ts",
);

process.env.E2E_ADMIN_REQUIRE_2FA = runsInitialAdminTwoFactorSpec ? "true" : "false";

const executable = process.platform === "win32" ? "playwright.cmd" : "playwright";
const child = spawn(executable, ["test", ...expandedArgs], {
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
