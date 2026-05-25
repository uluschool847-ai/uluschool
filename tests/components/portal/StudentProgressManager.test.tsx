import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitProgressNoteActionMock = vi.hoisted(() => vi.fn());
const editProgressNoteActionMock = vi.hoisted(() => vi.fn());
const archiveProgressNoteActionMock = vi.hoisted(() => vi.fn());
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
  archiveProgressNoteAction: archiveProgressNoteActionMock,
  editProgressNoteAction: editProgressNoteActionMock,
  submitProgressNoteAction: submitProgressNoteActionMock,
}));

import { StudentProgressManager } from "@/app/portal/teacher/components/StudentProgressManager";

const StudentProgressManagerContract = StudentProgressManager as unknown as ComponentType<
  Record<string, unknown>
>;

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

  it("renders a subject select for create mode and does not expose trusted teacherId", () => {
    render(
      <StudentProgressManagerContract
        studentId="student-101"
        subjectId="subject-123"
        subjects={[
          { id: "subject-123", name: "Algebra" },
          { id: "subject-456", name: "Geometry" },
        ]}
        notes={[]}
      />,
    );

    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /algebra/i })).toBeDefined();
    expect(document.querySelector('input[name="teacherId"]')).toBeNull();
  });

  it("validates required content and max length before submit", async () => {
    render(
      <StudentProgressManagerContract
        studentId="student-101"
        subjectId="subject-123"
        subjects={[{ id: "subject-123", name: "Algebra" }]}
        notes={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/progress note|note|content/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save note|add note|submit/i }));
    expect(screen.getByText(/content.*required|required.*content/i)).toBeDefined();
    expect(submitProgressNoteActionMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/progress note|note|content/i), {
      target: { value: "x".repeat(2001) },
    });
    fireEvent.click(screen.getByRole("button", { name: /save note|add note|submit/i }));
    expect(screen.getByText(/content.*2000|2000.*content/i)).toBeDefined();
    expect(submitProgressNoteActionMock).not.toHaveBeenCalled();
  });

  it("validates performance level values before submit", () => {
    render(
      <StudentProgressManagerContract
        studentId="student-101"
        subjectId="subject-123"
        subjects={[{ id: "subject-123", name: "Algebra" }]}
        notes={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/progress note|note|content/i), {
      target: { value: "Useful progress note." },
    });
    fireEvent.change(screen.getByLabelText(/performance level/i), {
      target: { value: "AVERAGE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save note|add note|submit/i }));

    expect(screen.getByText(/performance.*invalid|invalid.*performance/i)).toBeDefined();
    expect(submitProgressNoteActionMock).not.toHaveBeenCalled();
  });

  it("renders edit mode for teacher-owned active notes", async () => {
    editProgressNoteActionMock.mockResolvedValue({ success: true });

    render(
      <StudentProgressManagerContract
        studentId="student-101"
        subjectId="subject-123"
        subjects={[{ id: "subject-123", name: "Algebra" }]}
        notes={[
          {
            id: "note-1",
            content: "Needs more confidence with word problems.",
            performanceLevel: "STRUGGLING",
            subject: { id: "subject-123", name: "Algebra" },
            teacherName: "Teacher One",
            createdAt: "2026-05-20T09:00:00.000Z",
            updatedAt: "2026-05-21T09:00:00.000Z",
            archivedAt: null,
            canEdit: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByDisplayValue(/needs more confidence/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/progress note|note|content/i), {
      target: { value: "Updated note after lesson." },
    });
    fireEvent.change(screen.getByLabelText(/performance level/i), {
      target: { value: "GOOD" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes|update/i }));

    await waitFor(() => {
      expect(editProgressNoteActionMock).toHaveBeenCalledWith(
        "note-1",
        expect.objectContaining({
          content: "Updated note after lesson.",
          performanceLevel: "GOOD",
        }),
      );
    });
  });

  it("archives active notes with confirmation and Archive wording", async () => {
    archiveProgressNoteActionMock.mockResolvedValue({ success: true });

    render(
      <StudentProgressManagerContract
        studentId="student-101"
        subjectId="subject-123"
        subjects={[{ id: "subject-123", name: "Algebra" }]}
        notes={[
          {
            id: "note-1",
            content: "Ready to archive.",
            performanceLevel: "GOOD",
            createdAt: "2026-05-20T09:00:00.000Z",
            archivedAt: null,
            canEdit: true,
          },
        ]}
      />,
    );

    expect(screen.queryByText(/\bdelete\b/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(screen.getByText(/archive this progress note/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));

    await waitFor(() => {
      expect(archiveProgressNoteActionMock).toHaveBeenCalledWith("note-1");
    });
  });

  it("renders archived notes as read-only with an archived badge", () => {
    render(
      <StudentProgressManagerContract
        studentId="student-101"
        subjectId="subject-123"
        subjects={[{ id: "subject-123", name: "Algebra" }]}
        notes={[
          {
            id: "note-archived",
            content: "Archived historical progress.",
            performanceLevel: "GOOD",
            createdAt: "2026-05-20T09:00:00.000Z",
            archivedAt: "2026-05-22T09:00:00.000Z",
            canEdit: false,
          },
        ]}
      />,
    );

    expect(screen.getByText(/archived historical progress/i)).toBeDefined();
    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^archive$/i })).toBeNull();
  });
});
