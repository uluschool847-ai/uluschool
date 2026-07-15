import { UserRole } from "@prisma/client";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLegacySessionToken } from "@/e2e/helpers/session";

const cookieSetMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSetMock })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => ({ cookies: { set: vi.fn() } })),
    redirect: vi.fn((url: URL) => ({ type: "redirect", url: url.toString() })),
    json: vi.fn((body: unknown, init?: { status: number }) => ({
      type: "json",
      body,
      status: init?.status,
    })),
  },
}));

import { createSession, verifySessionToken } from "@/lib/auth/session";
import { middleware } from "../middleware";

function createProtectedRequest(token: string, path = "/portal/teacher"): NextRequest {
  const url = new URL(path, "https://school.test");
  return {
    nextUrl: url,
    url: url.href,
    cookies: { get: (name: string) => (name === "ulu_session" ? { value: token } : undefined) },
    headers: { get: () => null },
  } as unknown as NextRequest;
}

describe("middleware signed-session expiry integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
    process.env.AUTH_SESSION_SECRET = "x".repeat(32);
    process.env.NODE_ENV = "test";
    cookieSetMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(process.env, "AUTH_SESSION_SECRET");
  });

  it("redirects a shape-valid signed session at expiry with reason=expired", async () => {
    await createSession({
      uid: "teacher-1",
      role: UserRole.TEACHER,
      email: "teacher@example.com",
    });
    const token = cookieSetMock.mock.calls.find(([name]) => name === "ulu_session")?.[1];
    expect(token).toEqual(expect.any(String));

    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    await expect(verifySessionToken(token)).resolves.toEqual(
      expect.objectContaining({ purpose: "SESSION", exp: Date.now() }),
    );

    const response = await middleware(createProtectedRequest(token as string));
    const redirectUrl = new URL((response as { url: string }).url);

    expect(redirectUrl.pathname).toBe("/portal/login");
    expect(redirectUrl.searchParams.get("reason")).toBe("expired");
    expect(redirectUrl.searchParams.get("reason")).not.toBe("invalid");
  });

  it.each([
    ["password", UserRole.TEACHER, "/portal/teacher"],
    ["sso", UserRole.ADMIN, "/admin/security"],
  ] as const)(
    "rejects a signed legacy %s session in middleware",
    async (authMethod, role, path) => {
      const token = await createLegacySessionToken({
        uid: role === UserRole.ADMIN ? "admin-1" : "teacher-1",
        role,
        email: role === UserRole.ADMIN ? "admin@example.com" : "teacher@example.com",
        fullName: role === UserRole.ADMIN ? "Admin One" : "Teacher One",
        mfaVerified: true,
        authMethod,
      });

      const response = await middleware(createProtectedRequest(token, path));

      expect(response).toEqual(expect.objectContaining({ type: "redirect" }));
      const redirectUrl = new URL((response as { url: string }).url);
      expect(redirectUrl.pathname).toBe("/portal/login");
      expect(redirectUrl.searchParams.get("reason")).toBe("invalid");
    },
  );
});
