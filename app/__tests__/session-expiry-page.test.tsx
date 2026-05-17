import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const getAdminPendingTwoFactorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    getSession: getSessionMock,
    getAdminPendingTwoFactor: getAdminPendingTwoFactorMock,
  };
});

async function renderLoginPage(params?: Record<string, string>) {
  async function renderServerComponent(Component: () => Promise<JSX.Element>) {
    const element = await Component();
    render(element);
  }

  vi.resetModules();
  vi.doMock("@/components/auth/portal-login-form", () => ({
    PortalLoginForm: () => <div>Mock Login Form</div>,
  }));
  const { default: PortalLoginPage } = await import("@/app/portal/login/page");
  await renderServerComponent(() =>
    PortalLoginPage({ searchParams: Promise.resolve(params ?? {}) }),
  );
}

afterEach(() => {
  cleanup();
  vi.doUnmock("@/components/auth/portal-login-form");
});

describe("Portal login page session expiry messaging", () => {
  it("shows the expired-session message for reason=expired", async () => {
    getSessionMock.mockResolvedValue(null);
    getAdminPendingTwoFactorMock.mockResolvedValue(null);
    await renderLoginPage({ reason: "expired" });
    expect(screen.getByText(/your session has expired\. please log in again\./i)).toBeTruthy();
  });

  it("shows the invalid-session message for reason=invalid", async () => {
    getSessionMock.mockResolvedValue(null);
    getAdminPendingTwoFactorMock.mockResolvedValue(null);
    await renderLoginPage({ reason: "invalid" });
    expect(screen.getByText(/invalid session\. please log in\./i)).toBeTruthy();
  });

  it("shows the normal login page without any session warning when no reason is present", async () => {
    getSessionMock.mockResolvedValue(null);
    getAdminPendingTwoFactorMock.mockResolvedValue(null);
    await renderLoginPage();
    expect(screen.queryByText(/session has expired/i)).toBeNull();
    expect(screen.queryByText(/invalid session/i)).toBeNull();
    expect(screen.getAllByRole("heading", { name: /portal login/i }).length).toBeGreaterThan(0);
  });
});
