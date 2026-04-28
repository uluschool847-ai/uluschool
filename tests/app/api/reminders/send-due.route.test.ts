import { beforeEach, describe, expect, it, vi } from "vitest";

const processDueRemindersMock = vi.hoisted(() => vi.fn());
const sendOpsAlertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/reminders", () => ({
  processDueReminders: processDueRemindersMock,
}));

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

describe("app/api/reminders/send-due/route.ts token fallback behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "REMINDER_CRON_TOKEN");
  });

  it("returns 401 when REMINDER_CRON_TOKEN is missing", async () => {
    const { POST } = await import("../../../../app/api/reminders/send-due/route");

    const response = await POST(
      new Request("http://localhost/api/reminders/send-due", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 when authorization header token does not match", async () => {
    process.env.REMINDER_CRON_TOKEN = "expected-token";
    const { POST } = await import("../../../../app/api/reminders/send-due/route");

    const response = await POST(
      new Request("http://localhost/api/reminders/send-due", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("processes reminders when authorization header matches token", async () => {
    process.env.REMINDER_CRON_TOKEN = "expected-token";
    processDueRemindersMock.mockResolvedValueOnce({
      scannedClasses: 3,
      sent: 4,
      failed: 1,
      skipped: 2,
    });
    const { POST } = await import("../../../../app/api/reminders/send-due/route");

    const response = await POST(
      new Request("http://localhost/api/reminders/send-due", {
        method: "POST",
        headers: { authorization: "Bearer expected-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      scannedClasses: 3,
      sent: 4,
      failed: 1,
      skipped: 2,
    });
  });
});
