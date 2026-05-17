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

vi.mock("@/app/enrol/actions", () => ({
  submitEnrolment: actionMock,
}));

vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget">captcha</div>,
}));

import { EnrolForm } from "@/components/enrol/enrol-form";

const props = {
  subjects: [{ id: "subject-1", name: "Biology" }],
  levels: [{ id: "level-1", name: "Grade 6", slug: "grade-6" }],
};

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function advanceToSubmitStep() {
  const fillIfPresent = (label: RegExp, value: string) => {
    const field = screen.queryByLabelText(label) as HTMLInputElement | HTMLSelectElement | null;
    if (field && !field.value) {
      fireEvent.change(field, { target: { value } });
    }
  };

  for (let step = 0; step < 4; step += 1) {
    if (screen.queryByRole("button", { name: /submit enrolment/i })) {
      return;
    }
    fillIfPresent(/parent\/guardian name/i, "Parent A");
    fillIfPresent(/email address/i, "parent@example.com");
    fillIfPresent(/phone \/ whatsapp/i, "+254700000000");
    fillIfPresent(/student name/i, "Student A");
    fillIfPresent(/age \/ year level/i, "Grade 6");
    fillIfPresent(/curriculum level/i, "grade-6");
    const subject = screen.queryByLabelText(/biology/i) as HTMLInputElement | null;
    if (subject && !subject.checked) {
      fireEvent.click(subject);
    }
    const nextButton = screen.queryByRole("button", { name: /next step/i });
    if (!nextButton) break;
    fireEvent.click(nextButton);
  }
  throw new Error("Submit step was not reachable");
}

describe("EnrolForm accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, actionMock]);
    setViewport(1280);
  });

  afterEach(() => cleanup());

  it("exposes form controls through labels or aria-labels", () => {
    render(<EnrolForm {...props} />);

    expect(screen.getByLabelText(/parent\/guardian name/i)).not.toBeNull();
    expect(screen.getByLabelText(/email address/i)).not.toBeNull();
    expect(screen.getByLabelText(/phone \/ whatsapp/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    expect(screen.getByLabelText(/student name/i)).not.toBeNull();
    expect(screen.getByLabelText(/age \/ year level/i)).not.toBeNull();
    expect(screen.getByLabelText(/curriculum level/i)).not.toBeNull();
  });

  it("marks required fields semantically and visibly", () => {
    render(<EnrolForm {...props} />);

    const parent = screen.getByLabelText(/parent\/guardian name/i) as HTMLInputElement;
    const email = screen.getByLabelText(/email address/i) as HTMLInputElement;

    expect(parent.required || parent.getAttribute("aria-required") === "true").toBe(true);
    expect(email.required || email.getAttribute("aria-required") === "true").toBe(true);
    expect(document.body.textContent ?? "").toMatch(/\*|required/i);
  });

  it("links field errors with aria-describedby", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Validation failed",
        errors: { email: ["Enter a valid email address."] },
      },
      actionMock,
    ]);
    render(<EnrolForm {...props} />);

    const email = screen.getByLabelText(/email address/i);
    const error = screen.getByText(/enter a valid email address/i);
    const describedBy = email.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(error.getAttribute("id")).toBe(describedBy);
  });

  it("shows a loading state on the submit button", () => {
    useFormStatusMock.mockReturnValue({ pending: true });
    render(<EnrolForm {...props} />);
    advanceToSubmitStep();

    const button = screen.getByRole("button", { name: /submit enrolment/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("renders form-level server errors as an alert", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Email already registered" },
      actionMock,
    ]);
    render(<EnrolForm {...props} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/email already registered/i);
  });

  it("shows success feedback when submission succeeds", () => {
    useActionStateMock.mockReturnValue([
      { success: true, message: "Sent", referenceId: "MS-2026-0042" },
      actionMock,
    ]);
    render(<EnrolForm {...props} />);

    expect(screen.getByText(/thank you/i)).not.toBeNull();
    expect(screen.getByText(/reference id/i)).not.toBeNull();
  });

  it("uses full-width controls and avoids positive tabindex on mobile", () => {
    setViewport(375);
    const { container } = render(<EnrolForm {...props} />);

    const parent = screen.getByLabelText(/parent\/guardian name/i);
    expect(parent.className).toMatch(/w-full|full/i);

    const positiveTabIndex = Array.from(container.querySelectorAll("[tabindex]"))
      .map((element) => Number(element.getAttribute("tabindex")))
      .filter((value) => value > 0);
    expect(positiveTabIndex).toHaveLength(0);
  });
});
