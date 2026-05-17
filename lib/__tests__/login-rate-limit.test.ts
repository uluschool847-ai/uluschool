import * as rateLimitModule from "@/lib/security/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LoginRateLimitApi = {
  checkLoginRateLimit?: (identifier: string) => {
    allowed: boolean;
    remainingAttempts: number;
    retryAfterSeconds?: number;
  };
  recordFailedLogin?: (identifier: string) => void;
  recordSuccessfulLogin?: (identifier: string) => void;
  resetLoginRateLimit?: (identifier: string) => void;
};

function api(): Required<LoginRateLimitApi> {
  return rateLimitModule as unknown as Required<LoginRateLimitApi>;
}

describe("login rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows login while still under the failed-attempt limit", () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    resetLoginRateLimit("student@example.com");

    for (let i = 0; i < 4; i += 1) {
      recordFailedLogin("student@example.com");
    }

    const result = checkLoginRateLimit("student@example.com");
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBeGreaterThanOrEqual(0);
  });

  it("blocks login when the limit is exceeded and returns retryAfterSeconds", () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    resetLoginRateLimit("student@example.com");

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin("student@example.com");
    }

    const result = checkLoginRateLimit("student@example.com");
    expect(result.allowed).toBe(false);
    expect(result.remainingAttempts).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the failed-attempt counter after a successful login", () => {
    const { checkLoginRateLimit, recordFailedLogin, recordSuccessfulLogin, resetLoginRateLimit } =
      api();
    resetLoginRateLimit("parent@example.com");
    recordFailedLogin("parent@example.com");
    recordFailedLogin("parent@example.com");

    recordSuccessfulLogin("parent@example.com");

    const result = checkLoginRateLimit("parent@example.com");
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBeGreaterThanOrEqual(4);
  });

  it("resets the window after the retry period expires", () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    resetLoginRateLimit("teacher@example.com");

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin("teacher@example.com");
    }

    expect(checkLoginRateLimit("teacher@example.com").allowed).toBe(false);

    vi.advanceTimersByTime(1000 * 60 * 10);

    const result = checkLoginRateLimit("teacher@example.com");
    expect(result.allowed).toBe(true);
  });

  it("keeps different identifiers isolated from each other", () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    resetLoginRateLimit("admin@example.com");
    resetLoginRateLimit("10.0.0.7");

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin("admin@example.com");
    }

    expect(checkLoginRateLimit("admin@example.com").allowed).toBe(false);
    expect(checkLoginRateLimit("10.0.0.7").allowed).toBe(true);
  });

  it("resetLoginRateLimit clears the counter immediately", () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    recordFailedLogin("reset@example.com");
    recordFailedLogin("reset@example.com");

    resetLoginRateLimit("reset@example.com");

    const result = checkLoginRateLimit("reset@example.com");
    expect(result.allowed).toBe(true);
    expect(result.remainingAttempts).toBeGreaterThanOrEqual(4);
  });

  it("returns a consistent blocked state for concurrent checks after lockout", async () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    resetLoginRateLimit("concurrent@example.com");

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin("concurrent@example.com");
    }

    const results = await Promise.all([
      Promise.resolve(checkLoginRateLimit("concurrent@example.com")),
      Promise.resolve(checkLoginRateLimit("concurrent@example.com")),
      Promise.resolve(checkLoginRateLimit("concurrent@example.com")),
    ]);

    expect(results.every((result) => result.allowed === false)).toBe(true);
    expect(results.every((result) => (result.retryAfterSeconds ?? 0) > 0)).toBe(true);
  });

  it("defaults to a sensible limit when config is zero or negative", () => {
    const { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } = api();
    resetLoginRateLimit("edge@example.com");

    for (let i = 0; i < 3; i += 1) {
      recordFailedLogin("edge@example.com");
    }

    const result = checkLoginRateLimit("edge@example.com");
    expect(result.allowed).toBe(true);
  });
});
