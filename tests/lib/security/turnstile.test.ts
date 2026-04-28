import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["TURNSTILE_SECRET_KEY", "TURNSTILE_ENFORCE"] as const;

function resetEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("lib/security/turnstile.ts local-safe defaults", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
    vi.unstubAllGlobals();
  });

  it("allows requests when Turnstile secret is not configured and enforce is not true", async () => {
    const { verifyTurnstileToken } = await import("../../../lib/security/turnstile");

    const result = await verifyTurnstileToken(null);
    expect(result).toEqual({ ok: true });
  });

  it("blocks requests when Turnstile secret is missing and enforce=true", async () => {
    process.env.TURNSTILE_ENFORCE = "true";
    const { verifyTurnstileToken } = await import("../../../lib/security/turnstile");

    const result = await verifyTurnstileToken("token");
    expect(result).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
  });

  it("returns TOKEN_MISSING when secret is configured but token is empty", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const { verifyTurnstileToken } = await import("../../../lib/security/turnstile");

    const result = await verifyTurnstileToken("");
    expect(result).toEqual({ ok: false, reason: "TOKEN_MISSING" });
  });

  it("returns VERIFICATION_FAILED when Turnstile verification endpoint fails", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
      }),
    );
    const { verifyTurnstileToken } = await import("../../../lib/security/turnstile");

    const result = await verifyTurnstileToken("valid-token");
    expect(result).toEqual({ ok: false, reason: "VERIFICATION_FAILED" });
  });
});
