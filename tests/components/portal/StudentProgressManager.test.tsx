import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitProgressNoteActionMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/app/portal/teacher/actions/progress-actions", () => ({
  submitProgressNoteAction: submitProgressNoteActionMock,
}));

import { StudentProgressManager } from "@/app/portal/teacher/components/StudentProgressManager";

describe("StudentProgressManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders existing progress notes for the selected student", () => {
    render(
      <StudentProgressManager
        studentId="student-101"
        subjectId="subject-123"
        notes={[
          {
            id: "note-1",
            content: "Good progress in algebra.",
            performanceLevel: "GOOD",
            createdAt: "2026-06-01T09:00:00.000Z",
          },
          {
            id: "note-2",
            content: "Needs support in geometry proofs.",
            performanceLevel: "STRUGGLING",
            createdAt: "2026-06-08T09:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText(/good progress in algebra/i)).toBeDefined();
    expect(screen.getByText(/needs support in geometry proofs/i)).toBeDefined();
  });

  it("shows form with textarea and performance-level selector", () => {
    render(<StudentProgressManager studentId="student-101" subjectId="subject-123" notes={[]} />);

    expect(screen.getByLabelText(/progress note|note|content/i)).toBeDefined();
    expect(screen.getByLabelText(/performance level/i)).toBeDefined();
  });

  it("submits a note, calls action, and updates feedback/list", async () => {
    submitProgressNoteActionMock.mockResolvedValue({
      success: true,
      data: {
        id: "note-3",
        content: "Excellent participation today.",
        performanceLevel: "EXCELLENT",
      },
    });

    render(<StudentProgressManager studentId="student-101" subjectId="subject-123" notes={[]} />);

    fireEvent.change(screen.getByLabelText(/progress note|note|content/i), {
      target: { value: "Excellent participation today." },
    });
    fireEvent.change(screen.getByLabelText(/performance level/i), {
      target: { value: "EXCELLENT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save note|add note|submit/i }));

    await waitFor(() => {
      expect(submitProgressNoteActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "student-101",
          subjectId: "subject-123",
          content: "Excellent participation today.",
          performanceLevel: "EXCELLENT",
        }),
      );
    });

    expect(
      screen.queryByText(/saved successfully|progress note added|excellent participation today/i),
    ).toBeTruthy();
  });

  it("shows loading state while saving a note", async () => {
    let resolveAction: (value: unknown) => void = () => {};
    submitProgressNoteActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<StudentProgressManager studentId="student-101" subjectId="subject-123" notes={[]} />);

    fireEvent.change(screen.getByLabelText(/progress note|note|content/i), {
      target: { value: "Work in progress note." },
    });
    fireEvent.change(screen.getByLabelText(/performance level/i), {
      target: { value: "GOOD" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save note|add note|submit/i }));

    expect(screen.getByText(/saving|please wait|submitting/i)).toBeDefined();

    resolveAction({ success: true, data: { id: "note-9" } });
  });
});
