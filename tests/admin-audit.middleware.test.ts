import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  verifySessionToken: verifySessionTokenMock,
  getPortalLoginPath: vi.fn((path: string) => `/portal/login?next=${encodeURIComponent(path)}`),
  getPortalDashboardPath: vi.fn((role: string) => `/portal/${role.toLowerCase()}`),
}));

const redirectMock = vi.fn((url: string | URL) => ({ type: "redirect", url: url.toString() }));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => redirectMock(...(args as [string | URL])),
    next: () => ({ cookies: { set: vi.fn() } }),
    json: (body: unknown, init?: ResponseInit) => ({ body, init }),
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

describe("middleware /admin/audit access control", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects guests away from /admin/audit with callbackUrl preserved", async () => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest("/admin/audit?targetType=student");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain("callbackUrl=%2Fadmin%2Faudit%3FtargetType%3Dstudent");
  });

  it("redirects authenticated non-admin users away from /admin/audit", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({
      uid: "teacher-1",
      role: "TEACHER",
      email: "teacher@example.com",
      exp: Date.now() + 60000,
      mfaVerified: true,
      authMethod: "password",
    });

    const req = createMockRequest("/admin/audit", "teacher-token");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/unauthorized");
  });
});
