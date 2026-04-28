import { beforeEach, describe, expect, it, vi } from "vitest";

const sendOpsAlertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/monitoring/alerts", () => ({
  sendOpsAlert: sendOpsAlertMock,
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

describe("app/api/alerts/test/route.ts token fallback behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "ALERT_TEST_TOKEN");
  });

  it("returns 401 when ALERT_TEST_TOKEN is missing", async () => {
    const { POST } = await import("../../../../app/api/alerts/test/route");
    const response = await POST(
      new Request("http://localhost/api/alerts/test", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 when ALERT_TEST_TOKEN does not match", async () => {
    process.env.ALERT_TEST_TOKEN = "expected";
    const { POST } = await import("../../../../app/api/alerts/test/route");
    const response = await POST(
      new Request("http://localhost/api/alerts/test", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("calls alert sender when token is valid", async () => {
    process.env.ALERT_TEST_TOKEN = "expected";
    sendOpsAlertMock.mockResolvedValueOnce({ sent: false, reason: "ALERT_WEBHOOK_NOT_CONFIGURED" });
    const { POST } = await import("../../../../app/api/alerts/test/route");
    const response = await POST(
      new Request("http://localhost/api/alerts/test", {
        method: "POST",
        headers: { authorization: "Bearer expected" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      alert: { sent: false, reason: "ALERT_WEBHOOK_NOT_CONFIGURED" },
    });
  });
});
