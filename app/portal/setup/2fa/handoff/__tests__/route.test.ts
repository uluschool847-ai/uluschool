import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmActionMock = vi.hoisted(() => vi.fn());
const recoverActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/portal/setup/2fa/actions", () => ({
  confirmInitialTwoFactorSetupAction: confirmActionMock,
  recoverInitialTwoFactorHandoffAction: recoverActionMock,
}));

function request(formData: FormData, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/portal/setup/2fa/handoff", {
    method: "POST",
    headers: { origin },
    body: formData,
  });
}

describe("initial 2FA handoff route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmActionMock.mockResolvedValue({ phase: "error", success: false, message: "bounded" });
    recoverActionMock.mockResolvedValue({ phase: "error", success: false, message: "bounded" });
  });

  it.each([
    ["confirm", confirmActionMock],
    ["recover", recoverActionMock],
  ])(
    "dispatches same-origin %s form data through the hardened action",
    async (operation, action) => {
      const formData = new FormData();
      formData.set("operation", operation);
      formData.set("opaqueCapability", "SIGNED-OPAQUE-CAPABILITY");
      const { POST } = await import("@/app/portal/setup/2fa/handoff/route");

      const response = await POST(request(formData));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(action).toHaveBeenCalledOnce();
      expect(action.mock.calls[0][0]).toEqual({ phase: "idle", success: false, message: "" });
      const forwarded = action.mock.calls[0][1] as FormData;
      expect(forwarded.get("opaqueCapability")).toBe("SIGNED-OPAQUE-CAPABILITY");
      expect(await response.json()).toEqual({ phase: "error", success: false, message: "bounded" });
    },
  );

  it("rejects cross-origin and malformed operations without invoking an action", async () => {
    const valid = new FormData();
    valid.set("operation", "confirm");
    const invalid = new FormData();
    invalid.set("operation", "unknown");
    const { POST } = await import("@/app/portal/setup/2fa/handoff/route");

    const crossOriginResponse = await POST(request(valid, "https://attacker.example"));
    const malformedResponse = await POST(request(invalid));

    expect(crossOriginResponse.status).toBe(403);
    expect(malformedResponse.status).toBe(400);
    expect(confirmActionMock).not.toHaveBeenCalled();
    expect(recoverActionMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await malformedResponse.json())).not.toContain("unknown");
  });
});
