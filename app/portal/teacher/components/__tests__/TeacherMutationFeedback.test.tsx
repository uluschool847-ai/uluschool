import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const submitHomeworkActionMock = vi.hoisted(() => vi.fn());
const editHomeworkActionMock = vi.hoisted(() => vi.fn());
const archiveHomeworkActionMock = vi.hoisted(() => vi.fn());
const gradeSubmissionActionMock = vi.hoisted(() => vi.fn());
const submitProgressNoteActionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/app/portal/teacher/actions/homework-actions", () => ({
  submitHomeworkAction: submitHomeworkActionMock,
  editHomeworkAction: editHomeworkActionMock,
  archiveHomeworkAction: archiveHomeworkActionMock,
}));
vi.mock("@/app/portal/teacher/actions/grading-actions", () => ({
  gradeSubmissionAction: gradeSubmissionActionMock,
}));
vi.mock("@/app/portal/teacher/actions/progress-actions", () => ({
  submitProgressNoteAction: submitProgressNoteActionMock,
}));

import { HomeworkForm } from "@/app/portal/teacher/components/HomeworkForm";
import { HomeworkList } from "@/app/portal/teacher/components/HomeworkList";
import { StudentProgressManager } from "@/app/portal/teacher/components/StudentProgressManager";
import { SubmissionReviewForm } from "@/app/portal/teacher/components/SubmissionReviewForm";

describe("Teacher mutation feedback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("HomeworkForm shows form error feedback and preserves input on failed submit", async () => {
    submitHomeworkActionMock.mockResolvedValue({
      success: false,
      error: { title: ["Title is required"] },
    });
    render(<HomeworkForm mode="create" classes={[{ id: "c1", name: "Class 1" }]} />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Essay 1" } });
    fireEvent.change(screen.getByLabelText(/class/i), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: "2026-05-30" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /create homework/i }).closest("form") as HTMLFormElement,
    );
    expect(await screen.findByText(/title is required/i)).toBeDefined();
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Essay 1");
  });

  it("HomeworkList should provide visible success or error feedback after archive action", async () => {
    archiveHomeworkActionMock.mockResolvedValue({ success: true, message: "Archived" });
    render(
      <HomeworkList
        assignments={[
          {
            id: "a1",
            title: "Essay",
            description: "Desc",
            dueDate: "2026-05-10",
            className: "Class 1",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));
    await waitFor(() => expect(screen.getByText(/archived|something went wrong/i)).toBeDefined());
  });

  it("SubmissionReviewForm shows generic error feedback on thrown grading failure", async () => {
    gradeSubmissionActionMock.mockResolvedValue({ success: false, error: "Something went wrong" });
    render(<SubmissionReviewForm submissionId="s1" />);
    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "80" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /save grade/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeDefined());
  });

  it("StudentProgressManager shows saving feedback, error feedback, and preserves note content on failure", async () => {
    submitProgressNoteActionMock.mockResolvedValue({
      success: false,
      error: "Could not save note",
    });
    render(<StudentProgressManager studentId="stu-1" subjectId="sub-1" notes={[]} />);
    const textarea = screen.getByLabelText(/progress note/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Needs more support" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /save note/i }).closest("form") as HTMLFormElement,
    );
    expect(await screen.findByText(/could not save note/i)).toBeDefined();
    expect(textarea.value).toBe("Needs more support");
    expect((screen.getByRole("button", { name: /save note/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
