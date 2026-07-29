import { defineConfig, devices } from "@playwright/test";
import {
  loadProjectEnvironment,
  resolveE2EDatabaseEnvironment,
} from "./scripts/e2e-database-policy.mjs";

loadProjectEnvironment(process.env, process.cwd());
const e2eEnvironment = resolveE2EDatabaseEnvironment(process.env);
Object.assign(process.env, e2eEnvironment);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const reuseExistingServer = /^(1|true|yes)$/i.test(
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER ?? "",
);
const partition = process.env.E2E_PARTITION ?? "focused";
const isReleasePartition = ["standard", "signed-delivery", "storage"].includes(partition);
const isStoragePartition = partition === "storage";
const serverCommand = isStoragePartition
  ? "npm run dev"
  : (process.env.E2E_PLAYWRIGHT_SERVER_COMMAND ??
    process.env.PLAYWRIGHT_SERVER_COMMAND?.trim() ??
    "npm run dev");
const storageSpecPattern =
  /(?:^|[\\/])(admin-teachers|teacher-academics|teacher-materials)\.spec\.ts$/;
const signedDeliverySpecPattern = /(?:^|[\\/])e2e[\\/]storage[\\/]signed-file-delivery\.spec\.ts$/;
const testIgnore =
  partition === "standard" ? [storageSpecPattern, signedDeliverySpecPattern] : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isReleasePartition,
  retries: isReleasePartition ? 0 : 1,
  reporter: isReleasePartition ? [["./scripts/playwright-release-reporter.mjs"]] : undefined,
  workers: 1,
  timeout: 60000,
  testIgnore,
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
    command: serverCommand,
    url: baseURL,
    reuseExistingServer,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: e2eEnvironment.DATABASE_URL,
      DIRECT_URL: e2eEnvironment.DIRECT_URL,
      ...(isStoragePartition ? { STORAGE_DRIVER: "local" } : {}),
    },
  },
});
