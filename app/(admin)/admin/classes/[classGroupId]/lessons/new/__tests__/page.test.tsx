import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getClassGroupByIdMock = vi.hoisted(() => vi.fn());
const LessonFormMock = vi.hoisted(() =>
  vi.fn((props: Record<string, unknown>) => (
    <div data-testid="lesson-form">{JSON.stringify(props)}</div>
  )),
);
const RecurringLessonsFormMock = vi.hoisted(() =>
  vi.fn((props: Record<string, unknown>) => (
    <div data-testid="recurring-lessons-form">{JSON.stringify(props)}</div>
  )),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/class-group-repository", () => ({
  getClassGroupById: getClassGroupByIdMock,
}));

vi.mock("@/components/admin/classes/LessonForm", () => ({
  LessonForm: LessonFormMock,
}));

vi.mock("@/components/admin/classes/RecurringLessonsForm", () => ({
  RecurringLessonsForm: RecurringLessonsFormMock,
}));

type NewLessonPageModule = {
  default: (props: {
    params: Promise<{ classGroupId: string }> | { classGroupId: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadNewLessonPage() {
  const specifier = "@/app/(admin)/admin/classes/[classGroupId]/lessons/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<NewLessonPageModule>;
}

describe("Admin lesson create page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN and renders single and recurring lesson forms for the class group", async () => {
    getClassGroupByIdMock.mockResolvedValueOnce({
      id: "group-1",
      name: "IGCSE Mathematics Group A",
      status: "ACTIVE",
      subjectId: "subject-math",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      teacherId: "teacher-1",
      teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    });

    const page = await loadNewLessonPage();
    const element = await page.default({ params: { classGroupId: "group-1" } });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getClassGroupByIdMock).toHaveBeenCalledWith("group-1");
    expect(screen.getByRole("heading", { name: /create lesson|new lesson/i })).toBeDefined();
    expect(screen.getByText(/igcse mathematics group a/i)).toBeDefined();
    expect(screen.getByTestId("lesson-form")).toBeDefined();
    expect(screen.getByTestId("recurring-lessons-form")).toBeDefined();
    expect(LessonFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create",
        classGroup: expect.objectContaining({ id: "group-1" }),
      }),
      undefined,
    );
    expect(RecurringLessonsFormMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classGroup: expect.objectContaining({ id: "group-1" }),
      }),
      undefined,
    );
  });
});
