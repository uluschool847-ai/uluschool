import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTasksForStaleEnquiriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/automation-repository", () => ({
  generateTasksForStaleEnquiries: generateTasksForStaleEnquiriesMock,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

describe("app/api/cron/automation/route.ts env enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    Reflect.deleteProperty(process.env, "CRON_SECRET");
  });

  it("returns 401 when CRON_SECRET is missing", async () => {
    const { GET } = await import("../../../../app/api/cron/automation/route");

    const response = await GET(new Request("http://localhost/api/cron/automation"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when auth token does not match CRON_SECRET", async () => {
    process.env.CRON_SECRET = "expected-secret";
    const { GET } = await import("../../../../app/api/cron/automation/route");

    const response = await GET(
      new Request("http://localhost/api/cron/automation", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects Bearer undefined when CRON_SECRET is missing", async () => {
    const { GET } = await import("../../../../app/api/cron/automation/route");

    const response = await GET(
      new Request("http://localhost/api/cron/automation", {
        headers: { authorization: "Bearer undefined" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns success when token matches CRON_SECRET", async () => {
    process.env.CRON_SECRET = "expected-secret";
    generateTasksForStaleEnquiriesMock.mockResolvedValueOnce([{ id: "task-1" }, { id: "task-2" }]);
    const { GET } = await import("../../../../app/api/cron/automation/route");

    const response = await GET(
      new Request("http://localhost/api/cron/automation", {
        headers: { authorization: "Bearer expected-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      tasksCreated: 2,
      message: "Generated 2 manager tasks for stale enquiries.",
    });
  });
});
