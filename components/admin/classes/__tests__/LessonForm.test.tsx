import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createLessonActionMock = vi.hoisted(() => vi.fn());
const updateLessonActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/lessons/actions", () => ({
  createLessonAction: createLessonActionMock,
  updateLessonAction: updateLessonActionMock,
}));

type LessonFormModule = {
  LessonForm: (props: {
    mode: "create" | "edit";
    classGroup: { id: string; name: string };
    lesson?: Record<string, unknown>;
    teachers: Array<{ id: string; fullName: string; email: string }>;
    subjects: Array<{ id: string; name: string; slug: string }>;
    flashMessage?: string;
    flashError?: string;
  }) => JSX.Element;
};

async function loadLessonForm() {
  const specifier = "@/components/admin/classes/LessonForm";
  return import(/* @vite-ignore */ specifier) as Promise<LessonFormModule>;
}

describe("LessonForm admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create mode fields for a scheduled lesson/session", async () => {
    const { LessonForm } = await loadLessonForm();

    render(
      <LessonForm
        mode="create"
        classGroup={{ id: "group-1", name: "IGCSE Mathematics Group A" }}
        teachers={[{ id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" }]}
        subjects={[{ id: "subject-math", name: "Mathematics", slug: "mathematics" }]}
      />,
    );

    expect(screen.getByLabelText(/title/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/class group/i)).toHaveProperty("value", "group-1");
    expect(screen.getByLabelText(/teacher/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/start/i)).toBeDefined();
    expect(screen.getByLabelText(/end|duration/i)).toBeDefined();
    expect(screen.getByLabelText(/timezone/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/live lesson url|live url/i)).toBeDefined();
    expect(screen.getByLabelText(/meeting provider/i)).toBeDefined();
    expect(screen.getByLabelText(/reminder/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create lesson/i })).toBeDefined();
  });

  it("pre-fills edit mode and exposes reschedule controls", async () => {
    const { LessonForm } = await loadLessonForm();

    render(
      <LessonForm
        mode="edit"
        classGroup={{ id: "group-1", name: "IGCSE Mathematics Group A" }}
        lesson={{
          id: "lesson-1",
          title: "Quadratic functions",
          description: "Live problem-solving session",
          startAt: new Date("2026-06-01T10:00:00.000Z"),
          endAt: new Date("2026-06-01T11:00:00.000Z"),
          timezone: "Africa/Nairobi",
          status: "SCHEDULED",
          liveLessonUrl: "https://meet.google.com/abc-defg-hij",
          meetingProvider: "GOOGLE_MEET",
          teacherId: "teacher-1",
          subjectId: "subject-math",
        }}
        teachers={[{ id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" }]}
        subjects={[{ id: "subject-math", name: "Mathematics", slug: "mathematics" }]}
      />,
    );

    expect(screen.getByDisplayValue("Quadratic functions")).toBeDefined();
    expect(screen.getByDisplayValue("Live problem-solving session")).toBeDefined();
    expect(screen.getByDisplayValue("https://meet.google.com/abc-defg-hij")).toBeDefined();
    expect(screen.getByLabelText(/^start$/i)).toHaveProperty("value", "2026-06-01T13:00");
    expect(screen.getByLabelText(/^end$/i)).toHaveProperty("value", "2026-06-01T14:00");
    expect(screen.getByText(/scheduled/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /save lesson/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reschedule/i })).toBeDefined();
  });
});
