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

describe("middleware /admin/parents access control", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    "/admin/parents",
    "/admin/parents/new",
    "/admin/parents/parent-1",
    "/admin/parents/parent-1/edit",
  ])("redirects guests away from %s with callbackUrl preserved", async (path) => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest(path);
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain(`callbackUrl=${encodeURIComponent(path)}`);
  });

  it.each([
    ["STUDENT", "/admin/parents"],
    ["STUDENT", "/admin/parents/new"],
    ["STUDENT", "/admin/parents/parent-1"],
    ["STUDENT", "/admin/parents/parent-1/edit"],
    ["TEACHER", "/admin/parents"],
    ["TEACHER", "/admin/parents/new"],
    ["TEACHER", "/admin/parents/parent-1"],
    ["TEACHER", "/admin/parents/parent-1/edit"],
    ["PARENT", "/admin/parents"],
    ["PARENT", "/admin/parents/new"],
    ["PARENT", "/admin/parents/parent-1"],
    ["PARENT", "/admin/parents/parent-1/edit"],
  ])("redirects %s users away from %s", async (role, path) => {
    verifySessionTokenMock.mockResolvedValueOnce({
      uid: `${role.toLowerCase()}-1`,
      role,
      email: `${role.toLowerCase()}@example.com`,
      exp: Date.now() + 60000,
      mfaVerified: true,
      authMethod: "password",
    });

    const req = createMockRequest(path, `${role.toLowerCase()}-token`);
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/unauthorized");
  });
});
