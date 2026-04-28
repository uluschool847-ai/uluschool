import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock redirect to throw an error so we can catch and assert it
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

// Mock repositories and session so the action can run without database
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: vi.fn(() => Promise.resolve({
    id: "user-1",
    email: "test@uluglobalacademy.com",
    role: "STUDENT",
    isActive: true,
    passwordHash: "hashed",
  })),
  findAdminUserForTwoFactor: vi.fn(() => Promise.resolve({
    id: "admin-1",
    role: "ADMIN",
    twoFactorEnabled: true,
    twoFactorSecret: "mock-secret",
  })),
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(() => Promise.resolve()),
  clearAdminPendingTwoFactor: vi.fn(() => Promise.resolve()),
  getAdminPendingTwoFactor: vi.fn(() => Promise.resolve({ uid: "admin-1" })),
  getPortalRedirectPath: vi.fn((role, nextPath) => {
    // Emulate proper nextPath resolution
    if (nextPath) return nextPath;
    return role === "ADMIN" ? "/admin" : `/portal/${role.toLowerCase()}`;
  }),
}));

vi.mock("@/lib/auth/two-factor", () => ({
  verifyTotpCode: vi.fn(() => true),
}));

describe("Auth Server Actions - Next Parameter Resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("parses the next parameter and redirects to the exact intended path upon successful login", async () => {
    let loginAction: any;
    try {
      // Target the new canonical portal architecture path
      const modulePath = "../../../app/portal/login/actions";
      const module = await import(/* @vite-ignore */ modulePath);
      loginAction = module.loginAction || module.loginPortal;
    } catch (e) {
      // In Red Phase, the file might not exist or be relocated yet
      expect(true, "Action module app/portal/login/actions does not exist").toBe(false);
      return;
    }

    if (!loginAction) {
      expect(true, "loginAction not exported from module").toBe(false);
      return;
    }

    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", "/portal/student/assignments?view=past");

    // The action should parse 'next' and ultimately call redirect("/portal/student/assignments?view=past")
    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/student/assignments?view=past"
    );
  });

  it("parses the next parameter and redirects to the exact intended path upon successful 2FA", async () => {
    let verify2faAction: any;
    try {
      const modulePath = "../../../app/portal/login/verify-2fa/actions";
      const module = await import(/* @vite-ignore */ modulePath);
      verify2faAction = module.verify2faAction;
    } catch (e) {
      expect(true, "Action module app/portal/login/verify-2fa/actions does not exist").toBe(false);
      return;
    }

    if (!verify2faAction) {
      expect(true, "verify2faAction not exported from module").toBe(false);
      return;
    }

    const formData = new FormData();
    formData.set("code", "123456");
    formData.set("next", "/portal/admin/settings");

    await expect(verify2faAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/admin/settings"
    );
  });
});
