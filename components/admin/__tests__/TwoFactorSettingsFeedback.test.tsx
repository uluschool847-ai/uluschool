import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const useFormStatusMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus: useFormStatusMock };
});
vi.mock("@/app/(admin)/admin/security/actions", () => ({
  beginTwoFactorSetupAction: vi.fn(),
  confirmTwoFactorSetupAction: vi.fn(),
}));

import { TwoFactorSettings } from "@/components/admin/two-factor-settings";

describe("Admin two-factor settings feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReset();
    useFormStatusMock.mockReset();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock
      .mockReturnValueOnce([{ success: false, message: "" }, vi.fn()])
      .mockReturnValueOnce([{ success: false, message: "" }, vi.fn()])
      .mockReturnValueOnce([{ success: false, message: "" }, vi.fn()]);
  });
  afterEach(() => cleanup());

  it("shows loading feedback for setup actions", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<TwoFactorSettings enabled={false} />);
    expect(screen.getByRole("button", { name: /generating/i })).toBeDefined();
  });

  it("shows success feedback for generated secret and confirmation result", () => {
    useActionStateMock.mockReset();
    useActionStateMock
      .mockReturnValueOnce([
        {
          success: true,
          message: "Secret created",
          setupSecret: "ABC123",
          otpAuthUrl: "otpauth://demo",
        },
        vi.fn(),
      ])
      .mockReturnValueOnce([
        { success: true, message: "2FA enabled", backupCodes: ["CODE-1"] },
        vi.fn(),
      ])
      .mockReturnValueOnce([{ success: false, message: "" }, vi.fn()]);
    render(<TwoFactorSettings enabled={false} />);
    expect(screen.getByText(/current status:/i).textContent).toMatch(/enabled/i);
    expect(screen.getByText(/2fa enabled/i)).toBeDefined();
    expect(screen.getByText(/backup codes/i)).toBeDefined();
  });

  it("shows clear error feedback instead of silent failure", () => {
    useActionStateMock.mockReset();
    useActionStateMock
      .mockReturnValueOnce([{ success: false, message: "Could not generate secret" }, vi.fn()])
      .mockReturnValueOnce([{ success: false, message: "Invalid code" }, vi.fn()])
      .mockReturnValueOnce([{ success: false, message: "" }, vi.fn()]);
    render(<TwoFactorSettings enabled={false} />);
    expect(screen.getByText(/could not generate secret/i)).toBeDefined();
  });

  it("does not expose a self-service disable control for an enabled administrator", () => {
    render(<TwoFactorSettings enabled />);
    expect(screen.getByText(/current status:/i).textContent).toMatch(/enabled/i);
    expect(screen.queryByRole("button", { name: /disable 2fa/i })).toBeNull();
    expect(useActionStateMock).toHaveBeenCalledTimes(2);
  });
});
