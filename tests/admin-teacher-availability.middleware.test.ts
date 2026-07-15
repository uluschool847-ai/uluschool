import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  verifyAdminPendingTwoFactorToken: vi.fn(async () => null),
  getPortalDashboardPath: vi.fn((role: string) => `/portal/${role.toLowerCase()}`),
  getPortalLoginPath: vi.fn((path: string) => `/portal/login?next=${encodeURIComponent(path)}`),
  verifySessionToken: verifySessionTokenMock,
}));

const redirectMock = vi.fn((url: string | URL) => ({ type: "redirect", url: url.toString() }));

vi.mock("next/server", () => ({
  NextResponse: {
    next: () => ({ cookies: { set: vi.fn() } }),
    redirect: (...args: unknown[]) => redirectMock(...(args as [string | URL])),
  },
}));

import { middleware } from "@/middleware";

function createMockRequest(path: string, token?: string) {
  const url = new URL(`https://example.com${path}`);
  return {
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
    nextUrl: url,
    url: url.href,
  } as unknown as NextRequest;
}

describe("middleware /admin/teachers/[id]/availability access control", () => {
  const availabilityPath = "/admin/teachers/teacher-1/availability";

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects guests away from teacher availability with callbackUrl preserved", async () => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest(availabilityPath);
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain(`callbackUrl=${encodeURIComponent(availabilityPath)}`);
  });

  it("redirects authenticated non-admin users away from teacher availability", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({
      authMethod: "password",
      email: "teacher@example.com",
      exp: Date.now() + 60_000,
      mfaVerified: true,
      role: "TEACHER",
      uid: "teacher-1",
    });

    const req = createMockRequest(availabilityPath, "teacher-token");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/unauthorized");
  });
});
