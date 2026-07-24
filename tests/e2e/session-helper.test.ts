import { UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLegacyVersionTwoSessionToken, createSessionToken } from "@/e2e/helpers/session";
import { validateSession, verifySessionToken } from "@/lib/auth/session";

const TEST_SECRET = "test-auth-session-secret-at-least-32-chars";
const START = new Date("2026-07-14T10:00:00.000Z");

describe("E2E session helper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    process.env.AUTH_SESSION_SECRET = TEST_SECRET;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(process.env, "AUTH_SESSION_SECRET");
  });

  it("creates a purpose-bound token accepted by the real session verifier", async () => {
    const token = await createSessionToken({
      uid: "teacher-1",
      role: UserRole.TEACHER,
      email: "teacher@example.com",
      fullName: "Teacher One",
    });

    await expect(verifySessionToken(token)).resolves.toEqual({
      purpose: "SESSION",
      version: 3,
      uid: "teacher-1",
      role: UserRole.TEACHER,
      email: "teacher@example.com",
      fullName: "Teacher One",
      exp: START.getTime() + 60 * 60 * 1000,
      authMethod: "password",
    });
  });

  it("rejects a signed legacy version 2 session", async () => {
    const token = await createLegacyVersionTwoSessionToken({
      uid: "admin-1",
      role: UserRole.ADMIN,
      email: "admin@example.com",
      fullName: "Admin One",
      authMethod: "password",
    });

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("is rejected by server validation at exact expiry while middleware can classify it", async () => {
    const token = await createSessionToken({
      uid: "teacher-1",
      role: UserRole.TEACHER,
      email: "teacher@example.com",
      fullName: "Teacher One",
    });

    vi.advanceTimersByTime(60 * 60 * 1000);

    await expect(verifySessionToken(token)).resolves.toEqual(
      expect.objectContaining({ purpose: "SESSION", exp: Date.now() }),
    );
    await expect(validateSession(token)).resolves.toEqual({
      valid: false,
      expired: true,
      reason: "Session expired",
    });
  });
});
