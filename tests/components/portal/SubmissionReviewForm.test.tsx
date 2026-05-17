import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const gradeSubmissionActionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/app/portal/teacher/actions/grading-actions", () => ({
  gradeSubmissionAction: gradeSubmissionActionMock,
}));

import { SubmissionReviewForm } from "@/app/portal/teacher/components/SubmissionReviewForm";

describe("SubmissionReviewForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders grade input and feedback textarea", () => {
    render(<SubmissionReviewForm submissionId="sub-1" />);

    expect(screen.getByLabelText(/grade/i)).toBeDefined();
    expect(screen.getByLabelText(/feedback/i)).toBeDefined();
  });

  it("shows validation errors for empty or invalid grade", async () => {
    render(<SubmissionReviewForm submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade|grade|submit/i }));

    expect(await screen.findByText(/grade is required/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade|grade|submit/i }));

    expect(await screen.findByText(/grade.*invalid|grade must be/i)).toBeDefined();
  });

  it("calls gradeSubmissionAction with valid payload", async () => {
    gradeSubmissionActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmissionReviewForm submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "89" } });
    fireEvent.change(screen.getByLabelText(/feedback/i), {
      target: { value: "Good structure, improve calculations." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save grade|grade|submit/i }));

    expect(gradeSubmissionActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "sub-1",
        grade: 89,
        feedback: "Good structure, improve calculations.",
      }),
    );
  });
});
