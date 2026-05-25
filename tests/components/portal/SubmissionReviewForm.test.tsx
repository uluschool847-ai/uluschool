import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
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

const SubmissionReviewFormContract = SubmissionReviewForm as unknown as ComponentType<
  Record<string, unknown>
>;

describe("SubmissionReviewForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders pending submission fields with Save grade label", () => {
    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    expect(screen.getByLabelText(/grade/i)).toBeDefined();
    expect(screen.getByLabelText(/feedback/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^save grade$/i })).toBeDefined();
  });

  it("renders graded submission fields with initial values and Update grade label", () => {
    render(
      <SubmissionReviewFormContract
        submissionId="sub-1"
        initialGrade={88}
        initialFeedback="Good structure."
      />,
    );

    expect((screen.getByLabelText(/grade/i) as HTMLInputElement).value).toBe("88");
    expect((screen.getByLabelText(/feedback/i) as HTMLTextAreaElement).value).toBe(
      "Good structure.",
    );
    expect(screen.getByRole("button", { name: /^update grade$/i })).toBeDefined();
  });

  it("shows validation errors for empty or invalid grade", async () => {
    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade|grade|submit/i }));

    expect(await screen.findByText(/grade is required/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade|grade|submit/i }));

    expect(await screen.findByText(/grade.*invalid|grade must be/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade|grade|submit/i }));

    expect(await screen.findByText(/grade must be less than or equal to 100/i)).toBeDefined();
  });

  it("rejects feedback over 2000 characters before submitting", () => {
    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "91" } });
    fireEvent.change(screen.getByLabelText(/feedback/i), {
      target: { value: "x".repeat(2001) },
    });
    fireEvent.click(screen.getByRole("button", { name: /save grade/i }));

    expect(screen.getByText(/feedback.*2000/i)).toBeDefined();
    expect(gradeSubmissionActionMock).not.toHaveBeenCalled();
  });

  it("calls gradeSubmissionAction with valid payload", async () => {
    gradeSubmissionActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmissionReviewFormContract submissionId="sub-1" />);

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

  it("supports clearing existing feedback by submitting an empty value", async () => {
    gradeSubmissionActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(
      <SubmissionReviewFormContract
        submissionId="sub-1"
        initialGrade={88}
        initialFeedback="Remove this feedback"
      />,
    );

    fireEvent.change(screen.getByLabelText(/feedback/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /update grade/i }));

    expect(gradeSubmissionActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "sub-1",
        grade: 88,
        feedback: "",
      }),
    );
  });

  it("shows success feedback and stays in the submissions workflow after save", async () => {
    gradeSubmissionActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade/i }));

    expect(await screen.findByText(/grade saved|success/i)).toBeDefined();
    expect(routerPushMock).not.toHaveBeenCalledWith("/portal/teacher");
    expect(routerPushMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/portal\/teacher\/submissions(\/sub-1)?/),
    );
  });

  it("does not reset grade or feedback fields after a successful save", async () => {
    gradeSubmissionActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "92" } });
    fireEvent.change(screen.getByLabelText(/feedback/i), {
      target: { value: "Clear reasoning and notation." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save grade/i }));

    expect(await screen.findByText(/grade saved|success/i)).toBeDefined();
    expect((screen.getByLabelText(/grade/i) as HTMLInputElement).value).toBe("92");
    expect((screen.getByLabelText(/feedback/i) as HTMLTextAreaElement).value).toBe(
      "Clear reasoning and notation.",
    );
  });

  it("keeps the user on the same form and disables submit while saving", async () => {
    let resolveAction: (value: { data: { id: string }; success: true }) => void = () => {};
    gradeSubmissionActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "92" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade/i }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /save grade/i }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );

    resolveAction({ success: true, data: { id: "sub-1" } });

    expect(await screen.findByText(/grade saved|success/i)).toBeDefined();
    expect(routerPushMock).not.toHaveBeenCalledWith("/portal/teacher");
  });

  it("shows server action error feedback", async () => {
    gradeSubmissionActionMock.mockResolvedValue({
      success: false,
      error: "Forbidden/Unauthorized",
    });

    render(<SubmissionReviewFormContract submissionId="sub-1" />);

    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /save grade/i }));

    expect(await screen.findByText(/forbidden|unauthorized/i)).toBeDefined();
  });
});
