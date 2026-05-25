import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

type StudentProgressHistoryProps = {
  notes: Array<{
    id: string;
    archivedAt: string | null;
    content?: string;
    performanceLevel: "EXCELLENT" | "GOOD" | "STRUGGLING";
    recordedAt: string;
    statusLabel?: string;
    subject: { id: string; name: string } | null;
    teacher?: { id: string; name?: string; fullName?: string } | null;
    teacherName?: string;
    teacherNotes?: string;
    updatedAt: string;
  }>;
};

type StudentProgressHistoryModule = {
  StudentProgressHistory: ComponentType<StudentProgressHistoryProps>;
};

async function loadStudentProgressHistory() {
  const specifier = "@/app/portal/student/components/StudentProgressHistory";
  return import(/* @vite-ignore */ specifier) as Promise<StudentProgressHistoryModule>;
}

function note(overrides: Partial<StudentProgressHistoryProps["notes"][number]> = {}) {
  return {
    id: "progress-1",
    archivedAt: null,
    content: "Detailed algebra note with a long but safe explanation of the student's progress.",
    performanceLevel: "GOOD" as const,
    recordedAt: "2026-06-01T10:00:00.000Z",
    statusLabel: "Active",
    subject: { id: "subject-math", name: "Mathematics" },
    teacher: { id: "teacher-1", name: "Jane Teacher" },
    teacherName: "Jane Teacher",
    teacherNotes:
      "Detailed algebra note with a long but safe explanation of the student's progress.",
    updatedAt: "2026-06-02T10:30:00.000Z",
    ...overrides,
  };
}

describe("StudentProgressHistory", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows friendly empty state when there are no progress notes", async () => {
    const { StudentProgressHistory } = await loadStudentProgressHistory();

    render(<StudentProgressHistory notes={[]} />);

    expect(screen.getByText(/no progress notes yet/i)).toBeDefined();
  });

  it("renders progress note history with subject, level, teacher, dates, and status", async () => {
    const { StudentProgressHistory } = await loadStudentProgressHistory();

    render(<StudentProgressHistory notes={[note()]} />);

    const progressItem = screen.getByRole("article", { name: /mathematics/i });
    expect(within(progressItem).getByText(/^Subject:\s*Mathematics$/i)).toBeDefined();
    expect(within(progressItem).getByText(/performance:\s*good/i)).toBeDefined();
    expect(within(progressItem).getByText(/jane teacher/i)).toBeDefined();
    expect(within(progressItem).getByText(/recorded/i)).toBeDefined();
    expect(within(progressItem).getByText(/updated/i)).toBeDefined();
    expect(within(progressItem).getByText(/active/i)).toBeDefined();
    expect(within(progressItem).getByText(/detailed algebra note/i)).toBeDefined();
  });

  it("shows archived/read-only status without edit or archive controls", async () => {
    const { StudentProgressHistory } = await loadStudentProgressHistory();

    render(
      <StudentProgressHistory
        notes={[
          note({
            archivedAt: "2026-06-03T10:00:00.000Z",
            statusLabel: "Archived",
            teacherNotes: "Archived note should remain visible but read-only.",
          }),
        ]}
      />,
    );

    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.getByText(/archived note should remain visible/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /edit|archive|delete/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /edit|archive|delete/i })).toBeNull();
  });

  it("renders long note content safely", async () => {
    const { StudentProgressHistory } = await loadStudentProgressHistory();
    const longContent = "Consistent progress in independent work. ".repeat(30);

    render(
      <StudentProgressHistory
        notes={[note({ content: longContent, teacherNotes: longContent })]}
      />,
    );

    expect(screen.getByText(/consistent progress in independent work/i)).toBeDefined();
  });
});
