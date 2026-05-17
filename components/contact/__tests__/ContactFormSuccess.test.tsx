import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: useActionStateMock,
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  };
});

vi.mock("@/app/contact/actions", () => ({
  submitContactEnquiry: vi.fn(),
}));

vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget" />,
}));

type ContactFormModule = {
  ContactForm: () => JSX.Element;
};

async function loadContactForm() {
  const specifier = "@/components/contact/contact-form";
  return import(/* @vite-ignore */ specifier) as Promise<ContactFormModule>;
}

describe("Contact form success state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([
      {
        success: true,
        message: "Thank you. Your message has been submitted successfully.",
        referenceId: "MS-2026-3001",
        submittedAt: "2026-05-04T11:00:00.000Z",
        nextSteps: "We will contact you within 24 hours.",
      },
      vi.fn(),
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("replaces the contact form with a success message component after successful submission", async () => {
    const { ContactForm } = await loadContactForm();

    render(<ContactForm />);

    expect(screen.getByText(/thank you/i)).toBeDefined();
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  it("shows the unique referenceId, timestamp, and next steps in the contact success state", async () => {
    const { ContactForm } = await loadContactForm();

    render(<ContactForm />);

    expect(screen.getByText(/ms-2026-3001/i)).toBeDefined();
    expect(screen.getByText(/2026/i)).toBeDefined();
    expect(screen.getByText(/we will contact you within 24 hours/i)).toBeDefined();
  });
});
