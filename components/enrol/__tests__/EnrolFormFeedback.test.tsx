import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const formActionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("@/app/enrol/actions", () => ({ submitEnrolment: vi.fn() }));
vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile" />,
}));

import { EnrolForm } from "@/components/enrol/enrol-form";

const props = {
  subjects: [{ id: "subject-1", name: "Biology" }],
  levels: [{ id: "level-1", name: "Grade 6", slug: "grade-6" }],
};

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
    const nextStepButton = screen.queryByRole("button", { name: /next step/i });
    if (!nextStepButton) break;
    fireEvent.click(nextStepButton);
  }
  throw new Error("Submit step was not reachable");
}

describe("EnrolForm action feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, formActionMock, false]);
  });
  afterEach(() => cleanup());

  it("shows loading feedback while submitting", () => {
    useActionStateMock.mockReturnValue([{ success: false, message: "" }, formActionMock, true]);
    render(<EnrolForm {...props} />);
    advanceToSubmitStep();
    expect(
      (screen.getByRole("button", { name: /submit enrolment/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows success confirmation after successful submission", () => {
    useActionStateMock.mockReturnValue([
      { success: true, message: "Sent", referenceId: "MS-2026-0010" },
      vi.fn(),
      false,
    ]);
    render(<EnrolForm {...props} />);
    expect(screen.getByText(/thank you/i)).toBeDefined();
    expect(screen.getByText(/reference id/i)).toBeDefined();
  });

  it("shows error feedback and preserves entered data after failure", () => {
    const { rerender } = render(<EnrolForm {...props} />);
    fireEvent.change(screen.getByLabelText(/parent\/guardian name/i), {
      target: { value: "Parent A" },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "bad@email" } });

    useActionStateMock.mockReturnValue([
      { success: false, message: "Validation failed", errors: { email: ["Invalid email"] } },
      vi.fn(),
      false,
    ]);
    rerender(<EnrolForm {...props} />);

    expect(screen.getByText(/invalid email/i)).toBeDefined();
    expect((screen.getByLabelText(/parent\/guardian name/i) as HTMLInputElement).value).toBe(
      "Parent A",
    );
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe("bad@email");
  });

  it("shows the server consent error on the required checkbox", () => {
    useActionStateMock.mockReturnValue([
      {
        success: false,
        message: "Please enter valid details in the highlighted fields.",
        errors: { consentAccepted: ["Parent or guardian consent is required."] },
      },
      vi.fn(),
      false,
    ]);
    render(<EnrolForm {...props} />);
    advanceToSubmitStep();

    expect(screen.getByText(/parent or guardian consent is required/i)).toBeDefined();
  });

  it("does not invoke the action when final-step consent is unchecked", async () => {
    render(<EnrolForm {...props} />);
    advanceToSubmitStep();
    fireEvent.change(screen.getByLabelText(/preferred schedule/i), {
      target: { value: "Weekday evenings" },
    });

    fireEvent.submit(
      screen.getByRole("button", { name: /submit enrolment/i }).closest("form") as HTMLFormElement,
    );

    expect(formActionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/valid details/i);
  });

  it("invokes the action when final-step required controls are valid", async () => {
    render(<EnrolForm {...props} />);
    advanceToSubmitStep();
    fireEvent.change(screen.getByLabelText(/preferred schedule/i), {
      target: { value: "Weekday evenings" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /i am the parent or guardian/i }));

    fireEvent.submit(
      screen.getByRole("button", { name: /submit enrolment/i }).closest("form") as HTMLFormElement,
    );

    expect(formActionMock).toHaveBeenCalledTimes(1);
    const submittedData = formActionMock.mock.calls[0]?.[0] as FormData;
    expect(submittedData.get("consentAccepted")).toBe("true");
  });

  it("shows generic error feedback for unexpected failures", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Something went wrong" },
      vi.fn(),
      false,
    ]);
    render(<EnrolForm {...props} />);
    expect(screen.getByText(/something went wrong/i)).toBeDefined();
  });

  it("re-enables submit after an error", () => {
    useActionStateMock.mockReturnValue([
      { success: false, message: "Submission failed" },
      vi.fn(),
      false,
    ]);
    render(<EnrolForm {...props} />);
    advanceToSubmitStep();
    const button = screen.getByRole("button", { name: /submit enrolment/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
