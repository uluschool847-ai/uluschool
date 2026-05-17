import { UserRole } from "@prisma/client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const useFormStatusMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const getAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn());
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const findUserByEmailMock = vi.hoisted(() => vi.fn());
const checkLoginRateLimitMock = vi.hoisted(() => vi.fn());
const recordFailedLoginMock = vi.hoisted(() => vi.fn());
const recordSuccessfulLoginMock = vi.hoisted(() => vi.fn());
const logAuthEventMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus: useFormStatusMock };
});

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    createSession: createSessionMock,
    getSession: getSessionMock,
    getAdminPendingTwoFactor: getAdminPendingTwoFactorMock,
  };
});

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: findUserByEmailMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
  logAuthEvent: logAuthEventMock,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkLoginRateLimit: checkLoginRateLimitMock,
  recordFailedLogin: recordFailedLoginMock,
  recordSuccessfulLogin: recordSuccessfulLoginMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { loginAction } from "@/app/portal/login/actions";
import { PortalLoginForm } from "@/components/auth/portal-login-form";

type LoginUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  passwordHash: string;
  twoFactorEnabled?: boolean;
};

async function renderServerComponent(Component: () => Promise<JSX.Element>) {
  const element = await Component();
  render(element);
}

async function renderLoginPage(params?: Record<string, string>) {
  vi.resetModules();
  vi.doMock("@/components/auth/portal-login-form", () => ({
    PortalLoginForm: () => <div>Mock Login Form</div>,
  }));
  const { default: PortalLoginPage } = await import("@/app/portal/login/page");
  await renderServerComponent(() =>
    PortalLoginPage({ searchParams: Promise.resolve(params ?? {}) }),
  );
}

function makeLoginForm(nextPath?: string) {
  const formData = new FormData();
  formData.set("email", "teacher@example.com");
  formData.set("password", "CorrectHorse1!");
  if (nextPath) {
    formData.set("next", nextPath);
  }
  return formData;
}

function makeTeacher(overrides: Partial<LoginUser> = {}): LoginUser {
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    fullName: "Teacher One",
    role: UserRole.TEACHER,
    isActive: true,
    passwordHash: "hashed-password",
    ...overrides,
  };
}

describe("Portal login error UX", () => {
  beforeEach(() => {
    useActionStateMock.mockReset();
    useFormStatusMock.mockReset();
    getSessionMock.mockReset();
    getAdminPendingTwoFactorMock.mockReset();
    createSessionMock.mockReset();
    verifyPasswordMock.mockReset();
    findUserByEmailMock.mockReset();
    checkLoginRateLimitMock.mockReset();
    recordFailedLoginMock.mockReset();
    recordSuccessfulLoginMock.mockReset();
    logAuthEventMock.mockReset();
    createAdminAuditLogMock.mockReset();
    redirectMock.mockClear();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, vi.fn()]);
    getSessionMock.mockResolvedValue(null);
    getAdminPendingTwoFactorMock.mockResolvedValue(null);
    createSessionMock.mockResolvedValue(undefined);
    verifyPasswordMock.mockResolvedValue(true);
    findUserByEmailMock.mockResolvedValue(makeTeacher());
    checkLoginRateLimitMock.mockReturnValue({
      allowed: true,
      remainingAttempts: 3,
    });
    logAuthEventMock.mockResolvedValue(undefined);
    createAdminAuditLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.doUnmock("@/components/auth/portal-login-form");
  });

  it("shows a brute-force lockout message, disables submit, and shows retry timing", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Too many attempts. Try again in 5 minutes.",
        retryAfter: 300,
      },
      vi.fn(),
    ]);

    render(<PortalLoginForm />);

    expect(screen.getByText(/too many attempts/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /signing in|login/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/5 minutes|300/i)).toBeTruthy();
  });

  it("shows invalid credential attempts remaining and preserves typed values", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Invalid email or password. 3 attempts remaining.",
      },
      vi.fn(),
    ]);

    render(<PortalLoginForm />);

    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    const password = screen.getByLabelText(/password/i) as HTMLInputElement;
    fireEvent.change(email, { target: { value: "student@example.com" } });
    fireEvent.change(password, { target: { value: "wrong-password" } });

    expect(screen.getByText(/3 attempts remaining/i)).toBeTruthy();
    expect(email.value).toBe("student@example.com");
    expect(password.value).toBe("wrong-password");
  });

  it("shows a generic error message for unexpected failures", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Something went wrong" },
      vi.fn(),
    ]);

    render(<PortalLoginForm />);

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  it("shows the expired-session message above the login form when reason=expired", async () => {
    await renderLoginPage({ reason: "expired" });

    expect(screen.getByText(/your session has expired\. please log in again\./i)).toBeTruthy();
    expect(screen.getByText(/mock login form/i)).toBeTruthy();
  });

  it("shows the invalid-session message when reason=invalid", async () => {
    await renderLoginPage({ reason: "invalid" });

    expect(screen.getByText(/invalid session\. please log in\./i)).toBeTruthy();
  });

  it("shows the normal login page when no session reason is present", async () => {
    await renderLoginPage();

    expect(screen.queryByText(/session has expired/i)).toBeNull();
    expect(screen.queryByText(/invalid session/i)).toBeNull();
    expect(screen.getAllByRole("heading", { name: /portal login/i }).length).toBeGreaterThan(0);
  });

  it("rejects inactive teacher login with the same generic failure used for bad credentials", async () => {
    findUserByEmailMock.mockResolvedValue(makeTeacher({ isActive: false }));

    const result = await loginAction({ success: false, message: "" }, makeLoginForm());

    expect(result).toEqual({
      success: false,
      message: "Invalid email or password. 3 attempts remaining.",
    });
    expect(result.message).not.toMatch(/inactive|disabled|deactivated|account exists/i);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("records inactive teacher login failures like wrong-password attempts for rate-limit and audit", async () => {
    findUserByEmailMock.mockResolvedValue(makeTeacher({ isActive: false }));

    await loginAction({ success: false, message: "" }, makeLoginForm());

    expect(recordFailedLoginMock).toHaveBeenCalledWith("teacher@example.com");
    expect(checkLoginRateLimitMock).toHaveBeenCalledTimes(2);
    expect(logAuthEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "LOGIN_FAILED",
        identifier: "teacher@example.com",
      }),
    );
    expect(recordSuccessfulLoginMock).not.toHaveBeenCalled();
  });

  it("redirects an active teacher login to the teacher portal dashboard", async () => {
    await expect(loginAction({ success: false, message: "" }, makeLoginForm())).rejects.toThrow(
      "REDIRECT:/portal/teacher",
    );

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "teacher-1",
        role: UserRole.TEACHER,
        email: "teacher@example.com",
      }),
    );
    expect(recordSuccessfulLoginMock).toHaveBeenCalledWith("teacher@example.com");
  });

  it("allows teacher login redirects to a teacher portal next path", async () => {
    await expect(
      loginAction({ success: false, message: "" }, makeLoginForm("/portal/teacher/schedule")),
    ).rejects.toThrow("REDIRECT:/portal/teacher/schedule");
  });

  it.each([["/admin"], ["/portal/student"], ["https://evil.example/portal/teacher"]])(
    "falls back to the teacher dashboard for unsafe teacher next=%s",
    async (nextPath) => {
      await expect(
        loginAction({ success: false, message: "" }, makeLoginForm(nextPath)),
      ).rejects.toThrow("REDIRECT:/portal/teacher");
    },
  );
});
