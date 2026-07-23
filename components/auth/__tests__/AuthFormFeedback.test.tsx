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

vi.mock("@/app/portal/login/actions", () => ({ loginAction: vi.fn() }));

import { PortalLoginForm } from "@/components/auth/portal-login-form";

describe("Portal auth forms feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReset();
    useFormStatusMock.mockReset();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, vi.fn()]);
  });
  afterEach(() => cleanup());

  it("shows loading state while login is submitting", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<PortalLoginForm />);
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDefined();
  });

  it("shows login error feedback and preserves entered credentials on failure", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Invalid email or password.",
        errors: { email: ["Invalid email or password."] },
      },
      vi.fn(),
    ]);
    render(<PortalLoginForm />);
    expect(screen.getAllByText(/invalid email or password/i).length).toBeGreaterThan(0);
  });
});
