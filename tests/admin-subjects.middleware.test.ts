import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  verifyAdminPendingTwoFactorToken: vi.fn(async () => null),
  verifySessionToken: verifySessionTokenMock,
  getPortalLoginPath: vi.fn((path: string) => `/portal/login?next=${encodeURIComponent(path)}`),
  getPortalDashboardPath: vi.fn((role: string) => `/portal/${role.toLowerCase()}`),
}));

const redirectMock = vi.fn((url: string | URL) => ({ type: "redirect", url: url.toString() }));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => redirectMock(...(args as [string | URL])),
    next: () => ({ cookies: { set: vi.fn() } }),
  },
}));

import { middleware } from "@/middleware";

function createMockRequest(path: string, token?: string) {
  const url = new URL(`https://example.com${path}`);
  return {
    nextUrl: url,
    url: url.href,
    cookies: {
      get: (name: string) => {
        if (name === "ulu_session" && token) return { value: token };
        return undefined;
      },
      set: vi.fn(),
    },
    headers: {
      get: vi.fn(() => null),
    },
  } as unknown as NextRequest;
}

describe("middleware /admin/subjects access control", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(["/admin/subjects", "/admin/subjects/new", "/admin/subjects/subject-1/edit"])(
    "redirects guests away from %s with callbackUrl preserved",
    async (path) => {
      verifySessionTokenMock.mockResolvedValueOnce(null);

      const req = createMockRequest(path);
      await middleware(req);

      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/login");
      expect(redirectUrl).toContain("reason=invalid");
      expect(redirectUrl).toContain(`callbackUrl=${encodeURIComponent(path)}`);
    },
  );

  it.each(["/admin/subjects", "/admin/subjects/new", "/admin/subjects/subject-1/edit"])(
    "redirects non-admin authenticated users away from %s",
    async (path) => {
      verifySessionTokenMock.mockResolvedValueOnce({
        uid: "teacher-1",
        role: "TEACHER",
        email: "teacher@example.com",
        exp: Date.now() + 60_000,
        mfaVerified: true,
        authMethod: "password",
      });

      const req = createMockRequest(path, "teacher-token");
      await middleware(req);

      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/unauthorized");
    },
  );
});
