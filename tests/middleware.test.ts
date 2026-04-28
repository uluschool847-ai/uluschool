import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { middleware } from "../middleware";
import { verifySessionToken } from "../lib/auth/session";

// Mock the auth session module
vi.mock("../lib/auth/session", () => ({
  verifySessionToken: vi.fn(),
  getPortalLoginPath: vi.fn((path) => `/portal/login?next=${encodeURIComponent(path)}`),
  getPortalDashboardPath: vi.fn((role) => `/portal/${role.toLowerCase()}`),
}));

// Spies for NextResponse
const nextMock = vi.fn(() => ({ cookies: { set: vi.fn() } }));
const redirectMock = vi.fn((url: string | URL) => ({ type: "redirect", url: url.toString() }));
const rewriteMock = vi.fn((url: string | URL) => ({ type: "rewrite", url: url.toString() }));
const jsonMock = vi.fn((body: any, init?: { status: number }) => ({ type: "json", body, status: init?.status }));

// Mock next/server NextResponse
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

// Helper to construct a mock request without requiring full Edge Request setup
function createMockRequest(path: string, token?: string, bucket?: string) {
  const url = new URL(`http://localhost${path}`);
  return {
    nextUrl: url,
    url: url.href,
    cookies: {
      get: (name: string) => {
        if (name === "ulu_session" && token) return { value: token };
        if (name === "ab_pricing_bucket" && bucket) return { value: bucket };
        return undefined;
      },
      set: vi.fn(),
    },
    headers: {
      get: vi.fn(() => null),
    },
  } as unknown as NextRequest;
}

describe("Middleware Routing and Access Control", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Role-Based Access Control (RBAC) - Unauthenticated", () => {
    it("redirects Guest trying to access /admin to login", async () => {
      const req = createMockRequest("/admin");
      await middleware(req);
      
      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/login");
      expect(nextMock).toHaveBeenCalledTimes(1); // from initial NextResponse.next()
    });

    it("returns 401 for Guest trying to access /api/teacher", async () => {
      const req = createMockRequest("/api/teacher");
      const res = (await middleware(req)) as any;
      
      expect(jsonMock).toHaveBeenCalled();
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });
  });

  describe("Authorized Access", () => {
    it("allows ADMIN to access /admin", async () => {
      vi.mocked(verifySessionToken).mockResolvedValue({ 
        role: "ADMIN", 
        mfaVerified: true, 
        authMethod: "password" 
      } as any);
      
      const req = createMockRequest("/admin", "valid-admin-token");
      const res = await middleware(req);
      
      expect(redirectMock).not.toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
      // Should return the original response from NextResponse.next()
      expect(res).toEqual(expect.objectContaining({ cookies: expect.any(Object) }));
    });

    it("allows TEACHER to access /portal/teacher", async () => {
      vi.mocked(verifySessionToken).mockResolvedValue({ role: "TEACHER" } as any);
      const req = createMockRequest("/portal/teacher", "valid-teacher-token");
      const res = await middleware(req);
      
      expect(redirectMock).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ cookies: expect.any(Object) }));
    });
  });

  describe("Public Routes", () => {
    it("allows Guest to access public pages completely bypassing auth checks", async () => {
      const req = createMockRequest("/about");
      await middleware(req);
      
      expect(verifySessionToken).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
    });
  });

  describe("Rewrite Rules - The /pricing fix", () => {
    it("resolves /pricing successfully without rewriting to the broken /pricing-v2 path", async () => {
      // Simulate a scenario where the user was previously assigned bucket B
      const req = createMockRequest("/pricing", undefined, "B");
      await middleware(req);
      
      // We expect the rewrite to be completely removed
      expect(rewriteMock).not.toHaveBeenCalled();
    });
  });

  describe("Dead Prefixes - Preventing Over-protection", () => {
    it("does not protect deprecated /api/v1 routes, allowing natural 404", async () => {
      const req = createMockRequest("/api/v1/users");
      await middleware(req);
      
      // Should NOT return a 401. It should let Next.js continue and naturally 404.
      expect(jsonMock).not.toHaveBeenCalled();
    });

    it("does not protect deprecated /portal-old routes, allowing natural 404", async () => {
      const req = createMockRequest("/portal-old/dashboard");
      await middleware(req);
      
      // Starts with "/portal", but should NOT be protected since it's not actually the portal app
      expect(redirectMock).not.toHaveBeenCalled();
    });
  });

  describe("Advanced Auth Routing & Preservation", () => {
    it("preserves destination via next parameter for unauthenticated requests", async () => {
      const req = createMockRequest("/portal/teacher/grades");
      await middleware(req);
      
      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/login");
      expect(redirectUrl).toContain("next=%2Fportal%2Fteacher%2Fgrades");
    });

    it("rejects cross-role access with a hard 403 or explicit unauthorized state (not a soft fallback redirect)", async () => {
      // Mock authenticated STUDENT
      vi.mocked(verifySessionToken).mockResolvedValue({ role: "STUDENT" } as any);
      
      // Attempting to access Admin area
      const req = createMockRequest("/portal/admin");
      await middleware(req);
      
      const lastCall = redirectMock.mock.lastCall?.[0]?.toString() || "";
      
      // It should NOT softly redirect the student to their own dashboard (/portal/student)
      expect(lastCall).not.toContain("/portal/student");
      
      // It should ideally return a 403 response or explicitly redirect to an unauthorized page
      const is403Response = jsonMock.mock.calls.length > 0 && jsonMock.mock.lastCall?.[1]?.status === 403;
      const isUnauthorizedRedirect = lastCall.includes("/portal/unauthorized");
      expect(is403Response || isUnauthorizedRedirect).toBe(true);
    });

    it("preserves destination via next parameter for Admin 2FA checks", async () => {
      // Mock authenticated Admin but MFA not verified
      vi.mocked(verifySessionToken).mockResolvedValue({ 
        role: "ADMIN", 
        mfaVerified: false, 
        authMethod: "password" 
      } as any);
      
      const req = createMockRequest("/portal/admin/settings");
      await middleware(req);
      
      expect(redirectMock).toHaveBeenCalled();
      const redirectUrl = redirectMock.mock.lastCall?.[0]?.toString() || "";
      expect(redirectUrl).toContain("/portal/login/verify-2fa");
      expect(redirectUrl).toContain("next=%2Fportal%2Fadmin%2Fsettings");
    });
  });
});
