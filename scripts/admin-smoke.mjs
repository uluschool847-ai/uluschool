import { spawn } from "node:child_process";
import net from "node:net";

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
          reject(new Error("Unable to allocate an admin smoke port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

const port = await findFreeLocalPort();
const baseUrl = `http://localhost:${port}`;
const env = {
  ...process.env,
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? "fixed.admin@uluglobalacademy.com",
  E2E_PORTAL_PASSWORD:
    process.env.E2E_PORTAL_PASSWORD ?? process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!",
  PLAYWRIGHT_BASE_URL: baseUrl,
  PORT: String(port),
};

console.log(`Admin smoke base URL: ${baseUrl}`);
console.log(`Admin smoke account: ${env.E2E_ADMIN_EMAIL}`);

const child = spawn(
  process.execPath,
  [
    "scripts/playwright-test.mjs",
    "e2e/portals/admin-full-coverage.spec.ts",
    "--reporter=line",
    ...process.argv.slice(2),
  ],
  {
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
