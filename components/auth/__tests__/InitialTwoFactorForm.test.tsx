import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const useFormStatusMock = vi.hoisted(() => vi.fn());
const beginActionMock = vi.hoisted(() => vi.fn());
const confirmActionMock = vi.hoisted(() => vi.fn());
const recoverActionMock = vi.hoisted(() => vi.fn());
const writeTextMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

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
  recoverInitialTwoFactorHandoffAction: recoverActionMock,
}));

import { InitialTwoFactorForm } from "@/components/auth/InitialTwoFactorForm";

const idleState = { phase: "idle", success: false, message: "" };

function mockActionStates(setupState: unknown, confirmState: unknown, recoveryState = idleState) {
  let call = 0;
  useActionStateMock.mockImplementation(() => {
    const position = call % 3;
    call += 1;
    if (position === 0) return [setupState, beginActionMock];
    if (position === 1) return [confirmState, confirmActionMock];
    return [recoveryState, recoverActionMock];
  });
}

describe("InitialTwoFactorForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
    writeTextMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(idleState), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
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
        setupCapability: "SIGNED-CAPABILITY",
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
    expect(document.querySelector('input[name="setupCapability"]')).toHaveAttribute(
      "value",
      "SIGNED-CAPABILITY",
    );
    expect(screen.getByRole("button", { name: /copy manual setup key/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy authenticator uri/i })).toBeTruthy();
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
        setupCapability: "SIGNED-CAPABILITY",
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
        setupCapability: "SIGNED-CAPABILITY",
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
    expect(screen.getByRole("button", { name: /copy all backup codes/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /save your backup codes/i })).toBe(
      document.activeElement,
    );
  });

  it("removes stale setup material and exposes an explicit restart command", () => {
    useActionStateMock.mockReset();
    mockActionStates(
      {
        phase: "setup",
        success: true,
        message: "Authenticator ready.",
        setupSecret: "STALE-MANUAL-SECRET",
        otpAuthUrl: "otpauth://stale-uri",
        setupCapability: "STALE-CAPABILITY",
      },
      {
        phase: "restart-required",
        success: false,
        message: "Your two-factor setup changed. Start setup again.",
      },
    );

    render(<InitialTwoFactorForm />);

    expect(screen.getByRole("alert").textContent).toMatch(/setup changed/i);
    expect(screen.getByRole("button", { name: /start setup again/i })).toBeTruthy();
    expect(screen.queryByText("STALE-MANUAL-SECRET")).toBeNull();
    expect(screen.queryByText("otpauth://stale-uri")).toBeNull();
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull();
  });

  it("reveals only the fresh setup returned after an explicit restart", () => {
    let setupState: unknown = {
      phase: "setup",
      success: true,
      message: "Authenticator ready.",
      setupSecret: "STALE-MANUAL-SECRET",
      otpAuthUrl: "otpauth://stale-uri",
      setupCapability: "STALE-CAPABILITY",
    };
    const restartState = {
      phase: "restart-required",
      success: false,
      message: "Your two-factor setup changed. Start setup again.",
    };
    let actionCall = 0;
    useActionStateMock.mockImplementation(() => {
      const position = actionCall % 3;
      actionCall += 1;
      if (position === 0) return [setupState, beginActionMock];
      if (position === 1) return [restartState, confirmActionMock];
      return [idleState, recoverActionMock];
    });
    const { rerender } = render(<InitialTwoFactorForm />);
    const restartButton = screen.getByRole("button", { name: /start setup again/i });

    fireEvent.submit(restartButton.closest("form") as HTMLFormElement);
    setupState = {
      phase: "setup",
      success: true,
      message: "Fresh authenticator ready.",
      setupSecret: "FRESH-MANUAL-SECRET",
      otpAuthUrl: "otpauth://fresh-uri",
      setupCapability: "FRESH-CAPABILITY",
    };
    rerender(<InitialTwoFactorForm />);

    expect(screen.getByText("FRESH-MANUAL-SECRET")).toBeTruthy();
    expect(screen.queryByText("STALE-MANUAL-SECRET")).toBeNull();
    expect(screen.getByLabelText(/authenticator code/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers a recovery command when enrollment committed without completing handoff", () => {
    useActionStateMock.mockReset();
    mockActionStates(idleState, {
      phase: "handoff-required",
      success: true,
      message:
        "Two-factor authentication is enabled, but secure sign-in and backup-code delivery still need to be completed.",
      handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
    });

    render(<InitialTwoFactorForm />);

    expect(screen.getByRole("status").textContent).toMatch(/still need to be completed/i);
    expect(screen.getByRole("button", { name: /finish secure sign-in/i })).toBeTruthy();
    expect(document.querySelector('input[name="handoffCapability"]')).toHaveAttribute(
      "value",
      "SIGNED-HANDOFF-CAPABILITY",
    );
    expect(document.querySelector('input[name="userId"]')).toBeNull();
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull();
  });

  it("prioritizes handoff recovery when a restart races with enrollment completion", () => {
    useActionStateMock.mockReset();
    mockActionStates(
      {
        phase: "handoff-required",
        success: true,
        message:
          "Two-factor authentication is enabled, but secure sign-in and backup-code delivery still need to be completed.",
        handoffCapability: "SIGNED-HANDOFF-CAPABILITY",
      },
      {
        phase: "restart-required",
        success: false,
        message: "Your two-factor setup changed. Start setup again.",
      },
    );

    render(<InitialTwoFactorForm />);

    expect(screen.getByRole("button", { name: /finish secure sign-in/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start setup again/i })).toBeNull();
  });

  it("copies setup and backup credentials only through explicit in-memory controls", async () => {
    useActionStateMock.mockReset();
    mockActionStates(
      {
        phase: "setup",
        success: true,
        message: "Authenticator ready.",
        setupSecret: "MANUAL-SECRET",
        otpAuthUrl: "otpauth://restricted-uri",
        setupCapability: "SIGNED-CAPABILITY",
      },
      idleState,
    );
    const { unmount } = render(<InitialTwoFactorForm />);

    const keyCopy = screen.getByRole("button", { name: /copy manual setup key/i });
    keyCopy.focus();
    expect(document.activeElement).toBe(keyCopy);
    fireEvent.click(keyCopy);
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("MANUAL-SECRET"));
    expect(screen.getByRole("status").textContent).toMatch(/manual setup key copied/i);

    unmount();
    useActionStateMock.mockReset();
    const backupCodes = Array.from({ length: 8 }, (_, index) => `BACKUP-${index + 1}`);
    mockActionStates(idleState, {
      phase: "complete",
      success: true,
      message: "Two-factor authentication is enabled. Save these backup codes now.",
      backupCodes,
      continueHref: "/admin",
    });
    render(<InitialTwoFactorForm />);

    fireEvent.click(screen.getByRole("button", { name: /copy all backup codes/i }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith(backupCodes.join("\n")));
    expect(screen.getByRole("status").textContent).toMatch(/backup codes copied/i);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("submits confirmation through the same-origin handoff route without a page action refresh", async () => {
    render(<InitialTwoFactorForm />);
    const clientConfirmationAction = useActionStateMock.mock.calls[1][0] as (
      state: typeof idleState,
      formData: FormData,
    ) => Promise<unknown>;
    const formData = new FormData();
    formData.set("code", "123456");
    formData.set("setupCapability", "SIGNED-SETUP-CAPABILITY");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ phase: "error", success: false, message: "Invalid authenticator code." }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await clientConfirmationAction(idleState, formData);

    expect(fetchMock).toHaveBeenCalledWith(
      "/portal/setup/2fa/handoff",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const submitted = fetchMock.mock.calls[0][1].body as FormData;
    expect(submitted.get("operation")).toBe("confirm");
    expect(submitted.get("setupCapability")).toBe("SIGNED-SETUP-CAPABILITY");
    expect(result).toEqual({
      phase: "error",
      success: false,
      message: "Invalid authenticator code.",
    });
  });

  it("exposes pending progress and disables the active command", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(<InitialTwoFactorForm />);

    const button = screen.getByRole("button", { name: /preparing authenticator/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
