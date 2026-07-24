import { afterEach, describe, expect, it, vi } from "vitest";

import { parseSmokeCliArgs, runDeploymentSmoke } from "../smoke-deployment";

type SmokeEnvironment = "staging" | "production";

type AdminRedirect = {
  location?: string;
  status: number;
};

function createHealthyFetch(
  environment: SmokeEnvironment = "staging",
  adminRedirect: AdminRedirect = {
    location: "/portal/login?callbackUrl=%2Fadmin",
    status: 307,
  },
) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());

    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok", database: "ok" });
    }

    if (url.pathname === "/admin") {
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: adminRedirect.status,
        headers:
          adminRedirect.location === undefined ? undefined : { location: adminRedirect.location },
      });
    }

    if (url.pathname === "/robots.txt") {
      return new Response(
        environment === "staging" ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n",
        { status: 200 },
      );
    }

    return new Response("public page", { status: 200 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("runDeploymentSmoke", () => {
  it.each(["staging", "production"] as const)(
    "checks the launch routes and %s crawler policy",
    async (environment) => {
      const fetchImpl = createHealthyFetch(environment);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await expect(
        runDeploymentSmoke({
          baseUrl: "https://school.example.com",
          environment,
          fetchImpl,
        }),
      ).resolves.toEqual({ passed: 7, total: 7 });

      expect(fetchImpl.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
        "/api/health",
        "/",
        "/enrol",
        "/contact",
        "/portal/login",
        "/admin",
        "/robots.txt",
      ]);
      expect(log.mock.calls.map(([message]) => message)).toEqual([
        "PASS /api/health",
        "PASS /",
        "PASS /enrol",
        "PASS /contact",
        "PASS /portal/login",
        "PASS /admin",
        "PASS /robots.txt",
        `PASS 7/7 deployment smoke checks (${environment})`,
      ]);
    },
  );

  it.each(["http://school.example.com", "ftp://school.example.com"])(
    "rejects an unsafe deployment URL: %s",
    async (baseUrl) => {
      const fetchImpl = createHealthyFetch();

      await expect(
        runDeploymentSmoke({ baseUrl, environment: "staging", fetchImpl }),
      ).rejects.toThrow(/https/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
    "allows the local HTTP URL: %s",
    async (baseUrl) => {
      const fetchImpl = createHealthyFetch();
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      await expect(
        runDeploymentSmoke({ baseUrl, environment: "staging", fetchImpl }),
      ).resolves.toEqual({ passed: 7, total: 7 });
    },
  );

  it("rejects an unknown environment before requesting a route", async () => {
    const fetchImpl = createHealthyFetch();

    await expect(
      runDeploymentSmoke({
        baseUrl: "https://school.example.com",
        environment: "preview" as "staging",
        fetchImpl,
      }),
    ).rejects.toThrow(/environment/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("aborts an individual request after 15 seconds", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });

    const result = runDeploymentSmoke({
      baseUrl: "https://school.example.com",
      environment: "staging",
      fetchImpl,
    });
    const rejection = expect(result).rejects.toThrow("FAIL /api/health (status unavailable)");
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await rejection;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the timeout active while reading a response body", async () => {
    vi.useFakeTimers();
    let rejectBody: ((reason?: unknown) => void) | undefined;
    let requestSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      requestSignal = init?.signal;
      return {
        status: 200,
        headers: new Headers(),
        json: () =>
          new Promise((_resolve, reject) => {
            rejectBody = reject;
            requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
              once: true,
            });
          }),
      } as Response;
    });

    const result = runDeploymentSmoke({
      baseUrl: "https://school.example.com",
      environment: "staging",
      fetchImpl,
    }).catch((error: unknown) => error);

    try {
      await vi.advanceTimersByTimeAsync(15_000);
      expect(requestSignal?.aborted).toBe(true);
      await expect(result).resolves.toMatchObject({
        message: "FAIL /api/health (status 200)",
      });
    } finally {
      rejectBody?.(new Error("test cleanup"));
      await result;
    }
  });

  it("reports only the failing route and status, never a response body", async () => {
    const secretBody = "database password: do-not-log-this";
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(secretBody, { status: 503 }));

    let failure: Error | undefined;
    try {
      await runDeploymentSmoke({
        baseUrl: "https://school.example.com",
        environment: "production",
        fetchImpl,
      });
    } catch (error) {
      failure = error as Error;
    }

    expect(failure?.message).toBe("FAIL /api/health (status 503)");
    expect(failure?.message).not.toContain(secretBody);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails health checks unless both application and database status are ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ status: "ok", database: "error", detail: "private diagnostics" }),
    );

    await expect(
      runDeploymentSmoke({
        baseUrl: "https://school.example.com",
        environment: "production",
        fetchImpl,
      }),
    ).rejects.toThrow("FAIL /api/health (status 200)");
  });

  it("requires the admin response to remain a portal-login redirect", async () => {
    const fetchImpl = createHealthyFetch();
    fetchImpl.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/admin") {
        return new Response(null, { status: 302, headers: { location: "/sign-in" } });
      }
      if (url.pathname === "/api/health") {
        return Response.json({ status: "ok", database: "ok" });
      }
      if (url.pathname === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      }
      return new Response(null, { status: 200 });
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runDeploymentSmoke({
        baseUrl: "https://school.example.com",
        environment: "staging",
        fetchImpl,
      }),
    ).rejects.toThrow("FAIL /admin (status 302)");
  });

  it.each([
    ["root-relative", "/portal/login?callbackUrl=%2Fadmin"],
    [
      "absolute same-origin",
      "https://school.example.com/portal/login?callbackUrl=%2Fadmin#complete",
    ],
  ])("accepts a %s admin login redirect", async (_form, location) => {
    const fetchImpl = createHealthyFetch("staging", { location, status: 307 });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runDeploymentSmoke({
        baseUrl: "https://school.example.com",
        environment: "staging",
        fetchImpl,
      }),
    ).resolves.toEqual({ passed: 7, total: 7 });
  });

  it.each([
    ["another path", "/sign-in?redirect=WRONG_PATH_LOCATION", 302],
    ["a login-path suffix", "/portal/login/continue?token=WRONG_SUFFIX_LOCATION", 307],
    [
      "an off-origin absolute URL",
      "https://attacker.example/portal/login?token=OFF_ORIGIN_LOCATION",
      302,
    ],
    [
      "an off-origin protocol-relative URL",
      "//attacker.example/portal/login?token=PROTOCOL_RELATIVE_LOCATION",
      302,
    ],
    ["an invalid URL", "https://[invalid-host/portal/login?token=INVALID_LOCATION", 302],
    ["a missing Location header", undefined, 302],
    ["a non-redirect response", "/portal/login?token=NON_REDIRECT_LOCATION", 200],
  ])("rejects %s without exposing its Location", async (_case, location, status) => {
    const fetchImpl = createHealthyFetch("staging", { location, status });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    let thrown: Error | undefined;
    try {
      await runDeploymentSmoke({
        baseUrl: "https://school.example.com",
        environment: "staging",
        fetchImpl,
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown?.message).toBe(`FAIL /admin (status ${status})`);
    if (location !== undefined) {
      expect(thrown?.message).not.toContain(location);
      expect(JSON.stringify(log.mock.calls)).not.toContain(location);
    }
  });
});

describe("parseSmokeCliArgs", () => {
  it("accepts the two exact named arguments in either order", () => {
    expect(
      parseSmokeCliArgs([
        "--environment",
        "production",
        "--base-url",
        "https://school.example.com",
      ]),
    ).toEqual({ baseUrl: "https://school.example.com", environment: "production" });
  });

  it.each([
    ["--base-url", "https://school.example.com"],
    ["--base-url", "https://school.example.com", "--environment", "staging", "--verbose", "true"],
    ["--base-url", "https://one.example.com", "--base-url", "https://two.example.com"],
    ["https://school.example.com", "staging", "--environment", "staging"],
  ])("rejects missing, unknown, duplicate, or positional arguments", (args) => {
    expect(() => parseSmokeCliArgs(args)).toThrow(/^Usage:/);
  });
});
