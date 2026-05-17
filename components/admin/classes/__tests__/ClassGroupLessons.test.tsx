import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteScheduledClassActionMock = vi.hoisted(() => vi.fn());
const cancelScheduledClassActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/actions/academic-actions", () => ({
  cancelScheduledClassAction: cancelScheduledClassActionMock,
  deleteScheduledClassAction: deleteScheduledClassActionMock,
}));

type LessonRecord = {
  id: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  liveLessonUrl: string;
  classGroupId: string | null;
  subject?: { id: string; name: string; slug: string } | null;
};

type ClassGroupLessonsModule = {
  ClassGroupLessons: (props: {
    classGroupId: string;
    upcomingLessons: LessonRecord[];
    pastLessons: LessonRecord[];
    flashMessage?: string;
    flashError?: string;
  }) => JSX.Element;
};

async function loadClassGroupLessons() {
  const specifier = "@/components/admin/classes/ClassGroupLessons";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGroupLessonsModule>;
}

describe("ClassGroupLessons admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows upcoming and past lessons with live lesson URLs and lesson affordances", async () => {
    const { ClassGroupLessons } = await loadClassGroupLessons();

    render(
      <ClassGroupLessons
        classGroupId="group-1"
        upcomingLessons={[
          {
            id: "lesson-upcoming",
            title: "Quadratic functions",
            description: "Upcoming lesson",
            startAt: new Date("2026-06-01T10:00:00.000Z"),
            endAt: new Date("2026-06-01T11:00:00.000Z"),
            liveLessonUrl: "https://meet.example.com/upcoming",
            classGroupId: "group-1",
            subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          },
        ]}
        pastLessons={[
          {
            id: "lesson-past",
            title: "Algebra foundations",
            description: "Past lesson",
            startAt: new Date("2026-05-01T10:00:00.000Z"),
            endAt: new Date("2026-05-01T11:00:00.000Z"),
            liveLessonUrl: "https://meet.example.com/past",
            classGroupId: "group-1",
            subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: /upcoming lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /past lessons/i })).toBeDefined();
    expect(screen.getByText(/quadratic functions/i)).toBeDefined();
    expect(screen.getByText(/algebra foundations/i)).toBeDefined();
    expect(screen.getByText(/https:\/\/meet\.example\.com\/upcoming/i)).toBeDefined();
    expect(screen.getByText(/https:\/\/meet\.example\.com\/past/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /create lesson|new lesson/i })).toHaveProperty(
      "href",
      expect.stringContaining("/admin/classes/group-1/lessons/new"),
    );
    expect(screen.getAllByRole("link", { name: /edit/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /cancel/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /delete/i })).toHaveLength(2);
  });
});
