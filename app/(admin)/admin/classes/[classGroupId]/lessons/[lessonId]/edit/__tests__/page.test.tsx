import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getLessonByIdMock = vi.hoisted(() => vi.fn());
const LessonFormMock = vi.hoisted(() =>
  vi.fn((props: Record<string, unknown>) => (
    <div data-testid="lesson-form">{JSON.stringify(props)}</div>
  )),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/lesson-repository", () => ({
  getLessonById: getLessonByIdMock,
}));

vi.mock("@/components/admin/classes/LessonForm", () => ({
  LessonForm: LessonFormMock,
}));

type EditLessonPageModule = {
  default: (props: {
    params:
      | Promise<{ classGroupId: string; lessonId: string }>
      | { classGroupId: string; lessonId: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadEditLessonPage() {
  const specifier = "@/app/(admin)/admin/classes/[classGroupId]/lessons/[lessonId]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<EditLessonPageModule>;
}

describe("Admin lesson edit page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN, loads a lesson, and pre-fills the lesson form", async () => {
    getLessonByIdMock.mockResolvedValueOnce({
      id: "lesson-1",
      classGroupId: "group-1",
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
      classGroup: { id: "group-1", name: "IGCSE Mathematics Group A" },
      teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    });

    const page = await loadEditLessonPage();
    const element = await page.default({
      params: { classGroupId: "group-1", lessonId: "lesson-1" },
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getLessonByIdMock).toHaveBeenCalledWith("lesson-1");
    expect(screen.getByRole("heading", { name: /edit lesson/i })).toBeDefined();
    expect(screen.getByTestId("lesson-form")).toBeDefined();
    expect(LessonFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "edit",
        lesson: expect.objectContaining({
          id: "lesson-1",
          title: "Quadratic functions",
          status: "SCHEDULED",
          liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        }),
      }),
      undefined,
    );
  });
});
