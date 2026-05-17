import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/app/contact/actions", () => ({ submitContactEnquiry: vi.fn() }));
vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
}));

import { ContactForm } from "@/components/contact/contact-form";

describe("ContactForm action feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReset();
    useFormStatusMock.mockReset();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, vi.fn()]);
  });

  afterEach(() => cleanup());

  it("shows loading feedback while submitting", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<ContactForm />);
    expect(screen.getByRole("button", { name: /submitting/i })).toBeDefined();
  });

  it("shows success confirmation after successful submission", () => {
    useActionStateMock.mockReturnValue([
      { success: true, message: "Sent successfully", referenceId: "MS-2026-0001" },
      vi.fn(),
    ]);
    render(<ContactForm />);
    expect(screen.getByText(/thank you/i)).toBeDefined();
    expect(screen.getByText(/reference id/i)).toBeDefined();
  });

  it("shows error feedback and preserves typed data after failed submission", () => {
    const { rerender } = render(<ContactForm />);
    const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement;
    const messageInput = screen.getByLabelText(/^message$/i) as HTMLTextAreaElement;
    fireEvent.change(nameInput, { target: { value: "Parent Name" } });
    fireEvent.change(messageInput, { target: { value: "Need help with enrolment" } });

    useActionStateMock.mockReturnValue([
      { success: false, message: "Invalid email", errors: { email: ["Invalid email"] } },
      vi.fn(),
    ]);
    rerender(<ContactForm />);

    expect(screen.getAllByText(/invalid email/i).length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe("Parent Name");
    expect((screen.getByLabelText(/^message$/i) as HTMLTextAreaElement).value).toBe(
      "Need help with enrolment",
    );
  });

  it("surfaces a generic error message on unexpected failure instead of staying silent", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Something went wrong" },
      vi.fn(),
    ]);
    render(<ContactForm />);
    expect(screen.getByText(/something went wrong/i)).toBeDefined();
  });

  it("re-enables submit button after an error state", () => {
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "Submission failed" }, vi.fn()]);
    render(<ContactForm />);
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeDefined();
    expect((screen.getByRole("button", { name: /^submit$/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
