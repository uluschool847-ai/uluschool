import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const useFormStatusMock = vi.hoisted(() => vi.fn());
const actionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus: useFormStatusMock };
});

vi.mock("@/app/portal/setup/password/actions", () => ({
  changeInitialPasswordAction: actionMock,
}));

import { InitialPasswordForm } from "@/components/auth/InitialPasswordForm";

describe("InitialPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, actionMock]);
  });

  afterEach(() => cleanup());

  it("renders accessible current, new, and confirmation password controls", () => {
    render(<InitialPasswordForm />);

    const current = screen.getByLabelText(/current password/i) as HTMLInputElement;
    const next = screen.getByLabelText(/^new password/i) as HTMLInputElement;
    const confirm = screen.getByLabelText(/confirm new password/i) as HTMLInputElement;

    expect(current.type).toBe("password");
    expect(current.autocomplete).toBe("current-password");
    expect(current.required).toBe(true);
    expect(next.type).toBe("password");
    expect(next.autocomplete).toBe("new-password");
    expect(next.minLength).toBe(12);
    expect(confirm.type).toBe("password");
    expect(confirm.autocomplete).toBe("new-password");
    expect(confirm.minLength).toBe(12);
    expect(screen.queryByRole("textbox", { name: /user id/i })).toBeNull();
    expect(document.querySelector('input[name="userId"]')).toBeNull();
  });

  it("associates allowlisted field errors and announces the form error", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Invalid input.",
        errors: {
          currentPassword: ["Enter your current password."],
          newPassword: ["Use at least 12 characters."],
          confirmPassword: ["Passwords do not match."],
        },
      },
      actionMock,
    ]);

    render(<InitialPasswordForm />);

    expect(screen.getByLabelText(/current password/i).getAttribute("aria-describedby")).toBe(
      "current-password-error",
    );
    expect(screen.getByLabelText(/^new password/i).getAttribute("aria-describedby")).toBe(
      "new-password-error",
    );
    expect(screen.getByLabelText(/confirm new password/i).getAttribute("aria-describedby")).toBe(
      "confirm-password-error",
    );
    expect(screen.getByText("Enter your current password.").getAttribute("role")).toBe("alert");
    expect(screen.getByText("Use at least 12 characters.").getAttribute("role")).toBe("alert");
    expect(screen.getByText("Passwords do not match.").getAttribute("role")).toBe("alert");
    expect(screen.getByText("Invalid input.").getAttribute("role")).toBe("alert");
  });

  it("disables submission and exposes progress while pending", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(<InitialPasswordForm />);

    const button = screen.getByRole("button", { name: /changing password/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
