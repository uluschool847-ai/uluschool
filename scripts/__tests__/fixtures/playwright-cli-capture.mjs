import { writeFileSync } from "node:fs";

const captureFile = process.env.PLAYWRIGHT_TEST_CAPTURE_FILE;

if (!captureFile) {
  throw new Error("PLAYWRIGHT_TEST_CAPTURE_FILE is required for the test capture CLI.");
}

const capturedEnvironment = Object.fromEntries(
  [
    "PLAYWRIGHT_BASE_URL",
    "PORT",
    "PLAYWRIGHT_REUSE_EXISTING_SERVER",
    "PLAYWRIGHT_SERVER_COMMAND",
    "E2E_PLAYWRIGHT_SERVER_COMMAND",
    "E2E_ADMIN_REQUIRE_2FA",
    "ADMIN_REQUIRE_2FA",
    "E2E_PARTITION",
    "STORAGE_DRIVER",
  ].map((name) => [name, process.env[name] ?? null]),
);

writeFileSync(
  captureFile,
  JSON.stringify({ args: process.argv.slice(2), environment: capturedEnvironment }),
);

process.exit(Number(process.env.PLAYWRIGHT_TEST_EXIT_CODE ?? "0"));
