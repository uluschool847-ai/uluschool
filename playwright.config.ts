import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const reuseExistingServer = /^(1|true|yes)$/i.test(
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER ?? "",
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ADMIN_REQUIRE_2FA: process.env.E2E_ADMIN_REQUIRE_2FA ?? "false",
    },
  },
});
