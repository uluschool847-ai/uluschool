import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { middleware } from "../../middleware";
import { getPortalDashboardPath, getPortalLoginPath } from "../../lib/auth/session";

// Spies for NextResponse
const nextMock = vi.fn(() => ({ cookies: { set: vi.fn() } }));
const redirectMock = vi.fn((url: string | URL) => ({ type: "redirect", url: url.toString() }));
const rewriteMock = vi.fn((url: string | URL) => ({ type: "rewrite", url: url.toString() }));
const jsonMock = vi.fn((body: any, init?: { status: number }) => ({ type: "json", body, status: init?.status }));

// Mock next/server NextResponse to intercept middleware responses
vi.mock("next/server", () => {
  return {
    NextResponse: {
      next: (...args: any[]) => nextMock(...args),
      redirect: (...args: any[]) => redirectMock(...args),
      rewrite: (...args: any[]) => rewriteMock(...args),
      json: (...args: any[]) => jsonMock(...args),
    },
  };
});

// Helper to construct a mock NextRequest
function createMockRequest(path: string) {
  const url = new URL(`http://localhost${path}`);
  return {
    nextUrl: url,
    url: url.href,
    cookies: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
    },
    headers: {
      get: vi.fn(() => null),
    },
  } as unknown as NextRequest;
}

describe("Legacy Portal Redirection & Deprecation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Middleware Legacy Redirects (Enforcing Strict Compatibility Layer)", () => {
    it("redirects root /student-portal to the canonical /portal/student", async () => {
      const req = createMockRequest("/student-portal");
      await middleware(req);
      
      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/student");
    });

    it("redirects legacy auth entry point /student-portal/login to /portal/login", async () => {
      const req = createMockRequest("/student-portal/login");
      await middleware(req);
      
      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/login");
    });

    it("redirects deep legacy routes (e.g., /student-portal/assignments) preserving paths to /portal/student/assignments", async () => {
      const req = createMockRequest("/student-portal/assignments?view=past");
      await middleware(req);
      
      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/student/assignments?view=past");
    });
    
    it("ensures no legacy requests fall through to actual page rendering (catch-all constraint)", async () => {
      const req = createMockRequest("/student-portal/any-unknown-path");
      const res = await middleware(req);
      
      // If it returns the response from nextMock, it means middleware let it fall through to Next.js page rendering.
      // We expect it to be intercepted and redirected.
      expect(nextMock).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalled();
    });
  });

  describe("Auth Helper Utilities (session.ts)", () => {
    it("getPortalDashboardPath exclusively generates /portal paths, completely avoiding /student-portal", () => {
      expect(getPortalDashboardPath("STUDENT" as any)).toBe("/portal/student");
      expect(getPortalDashboardPath("TEACHER" as any)).toBe("/portal/teacher");
      expect(getPortalDashboardPath("STUDENT" as any)).not.toContain("/student-portal");
    });

    it("getPortalLoginPath defaults to the canonical /portal/login", () => {
      expect(getPortalLoginPath()).toBe("/portal/login");
    });
  });
});
