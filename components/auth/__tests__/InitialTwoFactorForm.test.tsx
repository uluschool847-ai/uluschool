import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const useFormStatusMock = vi.hoisted(() => vi.fn());
const beginActionMock = vi.hoisted(() => vi.fn());
const confirmActionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus: useFormStatusMock };
});

vi.mock("@/app/portal/setup/2fa/actions", () => ({
  beginInitialTwoFactorSetupAction: beginActionMock,
  confirmInitialTwoFactorSetupAction: confirmActionMock,
}));

import { InitialTwoFactorForm } from "@/components/auth/InitialTwoFactorForm";

const idleState = { phase: "idle", success: false, message: "" };

function mockActionStates(setupState: unknown, confirmState: unknown) {
  useActionStateMock
    .mockReturnValueOnce([setupState, beginActionMock])
    .mockReturnValueOnce([confirmState, confirmActionMock]);
}

describe("InitialTwoFactorForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
    mockActionStates(idleState, idleState);
  });

  afterEach(() => cleanup());

  it("starts with one accessible enrollment command and no client-supplied identity", () => {
    render(<InitialTwoFactorForm />);

    expect(screen.getByRole("button", { name: /set up authenticator/i })).toBeTruthy();
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull();
    expect(document.querySelector('input[name="userId"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /disable/i })).toBeNull();
  });

  it("shows the setup secret, URI, and accessible six-digit confirmation input", () => {
    useActionStateMock.mockReset();
    mockActionStates(
      {
        phase: "setup",
        success: true,
        message: "Add this account to your authenticator app, then confirm the code.",
        setupSecret: "MANUAL-SECRET",
        otpAuthUrl: "otpauth://restricted-uri",
      },
      idleState,
    );

    render(<InitialTwoFactorForm />);

    const code = screen.getByLabelText(/authenticator code/i) as HTMLInputElement;
    expect(code.inputMode).toBe("numeric");
    expect(code.maxLength).toBe(6);
    expect(code.pattern).toBe("[0-9]{6}");
    expect(code.autocomplete).toBe("one-time-code");
    expect(code.required).toBe(true);
    expect(screen.getByText("MANUAL-SECRET")).toBeTruthy();
    expect(screen.getByText("otpauth://restricted-uri")).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm and enable/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /disable/i })).toBeNull();
  });

  it("announces confirmation errors while retaining the successful setup phase", () => {
    useActionStateMock.mockReset();
    mockActionStates(
      {
        phase: "setup",
        success: true,
        message: "Authenticator ready.",
        setupSecret: "MANUAL-SECRET",
        otpAuthUrl: "otpauth://restricted-uri",
      },
      { phase: "error", success: false, message: "Invalid authenticator code." },
    );

    render(<InitialTwoFactorForm />);

    expect(screen.getByRole("alert").textContent).toMatch(/invalid authenticator code/i);
    expect(screen.getByText("MANUAL-SECRET")).toBeTruthy();
  });

  it("shows exactly eight one-time backup codes and a role-safe continue link after success", () => {
    const backupCodes = Array.from({ length: 8 }, (_, index) => `BACKUP-${index + 1}`);
    useActionStateMock.mockReset();
    mockActionStates(
      {
        phase: "setup",
        success: true,
        message: "Authenticator ready.",
        setupSecret: "MANUAL-SECRET",
        otpAuthUrl: "otpauth://restricted-uri",
      },
      {
        phase: "complete",
        success: true,
        message: "Two-factor authentication is enabled. Save these backup codes now.",
        backupCodes,
        continueHref: "/admin/classes",
      },
    );

    render(<InitialTwoFactorForm />);

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    for (const backupCode of backupCodes) {
      expect(screen.getByText(backupCode)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: /continue to admin/i })).toHaveAttribute(
      "href",
      "/admin/classes",
    );
    expect(screen.queryByText("MANUAL-SECRET")).toBeNull();
    expect(screen.queryByText("otpauth://restricted-uri")).toBeNull();
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /disable/i })).toBeNull();
  });

  it("exposes pending progress and disables the active command", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(<InitialTwoFactorForm />);

    const button = screen.getByRole("button", { name: /preparing authenticator/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
