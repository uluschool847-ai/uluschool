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

vi.mock("@/app/enrol/actions", () => ({
  submitEnrolment: vi.fn(),
}));

vi.mock("@/components/forms/turnstile-widget", () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget" />,
}));

type EnrolFormModule = {
  EnrolForm: (props: {
    subjects: Array<{
      id: string;
      name: string;
      slug?: string;
      isActive?: boolean;
      priority?: number;
    }>;
    levels: Array<{ id: string; name: string; slug: string }>;
  }) => JSX.Element;
};

async function loadEnrolForm() {
  const specifier = "@/components/enrol/enrol-form";
  return import(/* @vite-ignore */ specifier) as Promise<EnrolFormModule>;
}

describe("Enrolment form success state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([
      {
        success: true,
        message:
          "Thank you. Your enquiry has been submitted successfully. We will contact you shortly.",
        referenceId: "MS-2026-4001",
        submittedAt: "2026-05-04T11:30:00.000Z",
        nextSteps: "We will contact you within 24 hours to arrange the trial class.",
      },
      vi.fn(),
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("replaces the enrolment form with a success message component after successful submission", async () => {
    const { EnrolForm } = await loadEnrolForm();

    render(
      <EnrolForm
        subjects={[{ id: "subject-1", name: "Biology" }]}
        levels={[{ id: "level-1", name: "Grade 6", slug: "grade-6" }]}
      />,
    );

    expect(screen.getByText(/thank you/i)).toBeDefined();
    expect(screen.queryByLabelText(/parent\/guardian name/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /submit enrolment/i })).toBeNull();
  });

  it("shows the unique referenceId, timestamp, and next steps in the enrolment success state", async () => {
    const { EnrolForm } = await loadEnrolForm();

    render(
      <EnrolForm
        subjects={[{ id: "subject-1", name: "Biology" }]}
        levels={[{ id: "level-1", name: "Grade 6", slug: "grade-6" }]}
      />,
    );

    expect(screen.getByText(/ms-2026-4001/i)).toBeDefined();
    expect(screen.getByText(/2026/i)).toBeDefined();
    expect(
      screen.getByText(/we will contact you within 24 hours to arrange the trial class/i),
    ).toBeDefined();
  });
});
