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

vi.mock("@/app/contact/actions", () => ({
  submitContactEnquiry: actionMock,
}));

vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget">captcha</div>,
}));

import { ContactForm } from "@/components/contact/contact-form";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("ContactForm accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, actionMock]);
    setViewport(1280);
  });

  afterEach(() => cleanup());

  it("exposes all primary fields through labels", () => {
    render(<ContactForm />);

    expect(screen.getByLabelText(/full name/i)).not.toBeNull();
    expect(screen.getByLabelText(/email/i)).not.toBeNull();
    expect(screen.getByLabelText(/phone \/ whatsapp/i)).not.toBeNull();
    expect(screen.getByLabelText(/student grade/i)).not.toBeNull();
    expect(screen.getByLabelText(/^message$/i)).not.toBeNull();
  });

  it("marks required fields semantically and visually", () => {
    render(<ContactForm />);

    const fullName = screen.getByLabelText(/full name/i) as HTMLInputElement;
    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    const message = screen.getByLabelText(/^message$/i) as HTMLTextAreaElement;

    expect(fullName.required || fullName.getAttribute("aria-required") === "true").toBe(true);
    expect(email.required || email.getAttribute("aria-required") === "true").toBe(true);
    expect(message.required || message.getAttribute("aria-required") === "true").toBe(true);
    expect(document.body.textContent ?? "").toMatch(/\*|required/i);
  });

  it("associates validation errors with their fields via aria-describedby", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Please fix the errors",
        errors: { email: ["Enter a valid email address."] },
      },
      actionMock,
    ]);
    render(<ContactForm />);

    const email = screen.getByLabelText(/email/i);
    const error = screen.getByText(/enter a valid email address/i);
    const describedBy = email.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(error.getAttribute("id")).toBe(describedBy);
  });

  it("shows a loading state and touch-friendly submit button", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<ContactForm />);

    const button = screen.getByRole("button", { name: /submitting/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toMatch(/min-h-12|h-12/);
  });

  it("renders server errors as an alert", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Email already registered" },
      actionMock,
    ]);
    render(<ContactForm />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/email already registered/i);
  });

  it("renders success feedback instead of a blank form", () => {
    useActionStateMock.mockReturnValue([
      { success: true, message: "Sent", referenceId: "MS-2026-0011" },
      actionMock,
    ]);
    render(<ContactForm />);

    expect(screen.getByText(/thank you/i)).not.toBeNull();
    expect(screen.getByText(/reference id/i)).not.toBeNull();
  });

  it("uses mobile-friendly full-width inputs and stacked layout", () => {
    setViewport(375);
    const { container } = render(<ContactForm />);

    const email = screen.getByLabelText(/email/i);
    const phone = screen.getByLabelText(/phone \/ whatsapp/i);
    expect(email.className).toMatch(/w-full|full/i);
    expect(phone.className).toMatch(/w-full|full/i);

    const row = Array.from(container.querySelectorAll("div")).find((element) =>
      (element.className || "").includes("sm:grid-cols-2"),
    );
    expect(row?.className ?? "").not.toMatch(/(^|\s)grid-cols-2(\s|$)|flex-row/);
  });
});
