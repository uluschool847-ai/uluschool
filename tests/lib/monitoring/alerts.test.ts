import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("lib/monitoring/alerts.ts local-safe defaults", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "ALERT_WEBHOOK_URL");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(process.env, "ALERT_WEBHOOK_URL");
  });

  it("returns ALERT_WEBHOOK_NOT_CONFIGURED when webhook URL is not set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendOpsAlert } = await import("../../../lib/monitoring/alerts");

    const result = await sendOpsAlert({
      title: "Test",
      message: "Test message",
    });

    expect(result).toEqual({
      sent: false,
      reason: "ALERT_WEBHOOK_NOT_CONFIGURED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ALERT_WEBHOOK_FAILED when webhook responds with non-2xx", async () => {
    process.env.ALERT_WEBHOOK_URL = "http://localhost:4000/webhook";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
      }),
    );
    const { sendOpsAlert } = await import("../../../lib/monitoring/alerts");

    const result = await sendOpsAlert({
      title: "Test",
      message: "Test message",
    });

    expect(result).toEqual({
      sent: false,
      reason: "ALERT_WEBHOOK_FAILED",
    });
  });

  it("returns sent=true when webhook responds with 2xx", async () => {
    process.env.ALERT_WEBHOOK_URL = "http://localhost:4000/webhook";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
      }),
    );
    const { sendOpsAlert } = await import("../../../lib/monitoring/alerts");

    const result = await sendOpsAlert({
      title: "Test",
      message: "Test message",
      severity: "info",
    });

    expect(result).toEqual({
      sent: true,
    });
  });
});
