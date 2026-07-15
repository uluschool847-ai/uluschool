import { pathToFileURL } from "node:url";

import { z } from "zod";

const REQUEST_TIMEOUT_MS = 15_000;
const SMOKE_ROUTES = [
  "/api/health",
  "/",
  "/enrol",
  "/contact",
  "/portal/login",
  "/admin",
  "/robots.txt",
] as const;

type SmokeRoute = (typeof SMOKE_ROUTES)[number];
type SmokeEnvironment = "staging" | "production";

type DeploymentSmokeInput = {
  baseUrl: string;
  environment: SmokeEnvironment;
  fetchImpl?: typeof fetch;
};

const smokeInputSchema = z.object({
  baseUrl: z.string().url(),
  environment: z.enum(["staging", "production"]),
});

const cliInputSchema = z
  .object({
    "base-url": z.string().min(1),
    environment: z.enum(["staging", "production"]),
  })
  .strict();

const healthSchema = z
  .object({
    status: z.literal("ok"),
    database: z.literal("ok"),
  })
  .passthrough();

function failure(route: SmokeRoute, status?: number) {
  return new Error(`FAIL ${route} (status ${status ?? "unavailable"})`);
}

function validateBaseUrl(value: string) {
  const url = new URL(value);
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const validProtocol = url.protocol === "https:" || (isLoopback && url.protocol === "http:");

  if (!validProtocol) {
    throw new Error("Deployment base URL must use HTTPS except on localhost or 127.0.0.1.");
  }

  return url;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: URL,
  route: SmokeRoute,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    return {
      response,
      stopTimeout: () => clearTimeout(timeout),
    };
  } catch {
    clearTimeout(timeout);
    throw failure(route);
  }
}

async function verifyRoute(
  route: SmokeRoute,
  baseUrl: URL,
  environment: SmokeEnvironment,
  fetchImpl: typeof fetch,
) {
  const { response, stopTimeout } = await fetchWithTimeout(
    fetchImpl,
    new URL(route, baseUrl.origin),
    route,
    {
      redirect: route === "/admin" ? "manual" : "follow",
    },
  );

  try {
    if (route === "/admin") {
      const location = response.headers.get("location") ?? "";
      if (
        response.status < 300 ||
        response.status >= 400 ||
        !location.startsWith("/portal/login")
      ) {
        throw failure(route, response.status);
      }
      return;
    }

    if (response.status !== 200) {
      throw failure(route, response.status);
    }

    if (route === "/api/health") {
      try {
        const payload: unknown = await response.json();
        if (!healthSchema.safeParse(payload).success) {
          throw failure(route, response.status);
        }
      } catch {
        throw failure(route, response.status);
      }
    }

    if (route === "/robots.txt") {
      let robots = "";
      try {
        robots = await response.text();
      } catch {
        throw failure(route, response.status);
      }

      const expectedDirective =
        environment === "staging" ? /^Disallow:\s*\/\s*$/im : /^Allow:\s*\/\s*$/im;
      if (!expectedDirective.test(robots)) {
        throw failure(route, response.status);
      }
    }
  } finally {
    stopTimeout();
  }
}

export function parseSmokeCliArgs(args: string[]) {
  if (args.length !== 4) {
    throw new Error(
      "Usage: npm run smoke:deployment -- --base-url <url> --environment <staging|production>",
    );
  }

  const raw: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(
        "Usage: npm run smoke:deployment -- --base-url <url> --environment <staging|production>",
      );
    }

    const key = flag.slice(2);
    if (key in raw) {
      throw new Error(
        "Usage: npm run smoke:deployment -- --base-url <url> --environment <staging|production>",
      );
    }
    raw[key] = value;
  }

  const parsed = cliInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "Usage: npm run smoke:deployment -- --base-url <url> --environment <staging|production>",
    );
  }

  return {
    baseUrl: parsed.data["base-url"],
    environment: parsed.data.environment,
  };
}

export async function runDeploymentSmoke(input: DeploymentSmokeInput) {
  const parsed = smokeInputSchema.safeParse({
    baseUrl: input.baseUrl,
    environment: input.environment,
  });
  if (!parsed.success) {
    throw new Error("Invalid deployment base URL or environment.");
  }

  const baseUrl = validateBaseUrl(parsed.data.baseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;

  let passed = 0;
  for (const route of SMOKE_ROUTES) {
    await verifyRoute(route, baseUrl, parsed.data.environment, fetchImpl);
    passed += 1;
    console.log(`PASS ${route}`);
  }

  console.log(
    `PASS ${passed}/${SMOKE_ROUTES.length} deployment smoke checks (${input.environment})`,
  );
  return { passed, total: SMOKE_ROUTES.length };
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void runSmokeCli();
}

async function runSmokeCli() {
  try {
    const args = parseSmokeCliArgs(process.argv.slice(2));
    await runDeploymentSmoke(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment smoke failed.");
    process.exitCode = 1;
  }
}
