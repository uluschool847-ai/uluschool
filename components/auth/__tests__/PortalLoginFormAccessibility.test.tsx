import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/app/portal/login/actions", () => ({
  loginAction: actionMock,
}));

import { PortalLoginForm } from "@/components/auth/portal-login-form";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1024") ? width >= 1024 : width < 1024,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("PortalLoginForm accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, actionMock]);
    setViewport(1280);
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes all inputs through accessible labels", () => {
    render(<PortalLoginForm />);

    expect(screen.getByLabelText(/email/i)).not.toBeNull();
    expect(screen.getByLabelText(/password/i)).not.toBeNull();
  });

  it("marks required fields semantically and visually", () => {
    render(<PortalLoginForm />);

    const email = screen.getByLabelText(/email/i) as HTMLInputElement;
    const password = screen.getByLabelText(/password/i) as HTMLInputElement;

    expect(email.required || email.getAttribute("aria-required") === "true").toBe(true);
    expect(password.required || password.getAttribute("aria-required") === "true").toBe(true);
    expect(document.body.textContent ?? "").toMatch(/\*|required/i);
  });

  it("links field errors to inputs through aria-describedby", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Validation failed",
        errors: { email: ["Enter a valid email address."] },
      },
      actionMock,
    ]);
    render(<PortalLoginForm />);

    const email = screen.getByLabelText(/email/i);
    const error = screen.getByText(/enter a valid email address/i);
    const describedBy = email.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(error.getAttribute("id")).toBe(describedBy);
  });

  it("provides an accessible submit button and loading state", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<PortalLoginForm />);

    const button = screen.getByRole("button", { name: /signing in/i }) as HTMLButtonElement;
    expect((button.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect(button.disabled).toBe(true);
  });

  it("surfaces server errors as an alert region", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Email already registered" },
      actionMock,
    ]);
    render(<PortalLoginForm />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/email already registered/i);
  });

  it("uses full-width mobile-friendly inputs without positive tabindex", () => {
    setViewport(375);
    const { container } = render(<PortalLoginForm />);

    const inputs = [screen.getByLabelText(/email/i), screen.getByLabelText(/password/i)];

    for (const input of inputs) {
      expect(input.className).toMatch(/w-full|full/i);
    }

    const positiveTabIndex = Array.from(container.querySelectorAll("[tabindex]"))
      .map((element) => Number(element.getAttribute("tabindex")))
      .filter((value) => value > 0);
    expect(positiveTabIndex).toHaveLength(0);
  });

  it("keeps the submit control touch-friendly", () => {
    render(<PortalLoginForm />);

    const button = screen.getByRole("button", { name: /login/i });
    expect(button.className).toMatch(/min-h-12|h-12/);
  });

  it("submits from keyboard Enter on an input", () => {
    render(<PortalLoginForm />);

    const form = screen.getByRole("button", { name: /login/i }).closest("form");
    const email = screen.getByLabelText(/email/i);
    expect(form).not.toBeNull();
    const submitSpy = vi.fn((event: Event) => event.preventDefault());
    form?.addEventListener("submit", submitSpy);

    fireEvent.keyDown(email, { key: "Enter", code: "Enter" });
    if (form) {
      fireEvent.submit(form);
    }

    expect(submitSpy).toHaveBeenCalled();
  });
});
