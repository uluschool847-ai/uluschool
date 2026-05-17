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

describe("middleware /admin/students access control", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects guests away from /admin/students with callbackUrl preserved", async () => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest("/admin/students");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain("callbackUrl=%2Fadmin%2Fstudents");
  });

  it("redirects guests away from /admin/students/new with callbackUrl preserved", async () => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest("/admin/students/new");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain("callbackUrl=%2Fadmin%2Fstudents%2Fnew");
  });

  it("redirects guests away from /admin/students/[id]/edit with callbackUrl preserved", async () => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest("/admin/students/student-1/edit");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain("callbackUrl=%2Fadmin%2Fstudents%2Fstudent-1%2Fedit");
  });

  it("redirects guests away from /admin/students/[id] with callbackUrl preserved", async () => {
    verifySessionTokenMock.mockResolvedValueOnce(null);

    const req = createMockRequest("/admin/students/student-1");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/login");
    expect(redirectUrl).toContain("reason=invalid");
    expect(redirectUrl).toContain("callbackUrl=%2Fadmin%2Fstudents%2Fstudent-1");
  });

  it("redirects non-admin authenticated users away from /admin/students", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
      exp: Date.now() + 60000,
      mfaVerified: true,
      authMethod: "password",
    });

    const req = createMockRequest("/admin/students", "student-token");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/unauthorized");
  });

  it("redirects non-admin authenticated users away from /admin/students/[id]/edit", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
      exp: Date.now() + 60000,
      mfaVerified: true,
      authMethod: "password",
    });

    const req = createMockRequest("/admin/students/student-1/edit", "student-token");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/unauthorized");
  });

  it("redirects non-admin authenticated users away from /admin/students/[id]", async () => {
    verifySessionTokenMock.mockResolvedValueOnce({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
      exp: Date.now() + 60000,
      mfaVerified: true,
      authMethod: "password",
    });

    const req = createMockRequest("/admin/students/student-1", "student-token");
    await middleware(req);

    expect(redirectMock).toHaveBeenCalled();
    const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
    expect(redirectUrl).toContain("/portal/unauthorized");
  });
});
