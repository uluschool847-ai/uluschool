import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getHomeworkAssignmentByIdMock = vi.hoisted(() => vi.fn());
const listTeacherClassGroupsMock = vi.hoisted(() => vi.fn());
const getSubjectsMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/homework-repository", () => ({
  getHomeworkAssignmentById: getHomeworkAssignmentByIdMock,
}));

vi.mock("@/lib/repositories/teacher-classes-repository", () => ({
  listTeacherClassGroups: listTeacherClassGroupsMock,
}));

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getSubjects: getSubjectsMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/app/portal/teacher/components/HomeworkForm", () => ({
  HomeworkForm: ({
    classes,
    initialValues,
    mode,
    subjects,
  }: {
    classes: Array<{ id: string; name: string }>;
    initialValues: { classId: string; title: string };
    mode: string;
    subjects: Array<{ id: string; name: string }>;
  }) => (
    <section aria-label="Homework form mock">
      <p>mode:{mode}</p>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" defaultValue={initialValues.title} />
      <label htmlFor="classId">Class / group</label>
      <select id="classId" name="classId" defaultValue={initialValues.classId}>
        {classes.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <label htmlFor="subjectId">Subject</label>
      <select id="subjectId" name="subjectId">
        {subjects.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button type="submit">Save changes</button>
      <a href="/portal/teacher/assignments">Cancel</a>
    </section>
  ),
}));

type EditAssignmentPageModule = {
  default: (props: {
    params: Promise<{ assignmentId: string }> | { assignmentId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/assignments/[assignmentId]/edit/page.tsx";

async function loadEditAssignmentPage() {
  const specifier = "@/app/portal/teacher/assignments/[assignmentId]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<EditAssignmentPageModule>;
}

function homeworkAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "hw-1",
    title: "Initial homework title",
    description: "Initial homework description",
    dueDate: new Date("2026-06-22T20:00:00.000Z"),
    archivedAt: null,
    subjectId: "subject-math",
    scheduledClassId: "group-1",
    scheduledClass: {
      id: "lesson-1",
      classGroupId: "group-1",
      classGroup: { id: "group-1", name: "Algebra Group A" },
    },
    ...overrides,
  };
}

describe("Teacher assignment edit page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getHomeworkAssignmentByIdMock.mockResolvedValue(homeworkAssignment());
    listTeacherClassGroupsMock.mockResolvedValue([{ id: "group-1", name: "Algebra Group A" }]);
    getSubjectsMock.mockResolvedValue([{ id: "subject-math", name: "Mathematics" }]);
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard and scoped homework loader", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("getHomeworkAssignmentById");
    expect(source).not.toContain('requireRole(["TEACHER"])');
  });

  it("loads the assignment with assignmentId and session uid", async () => {
    const page = await loadEditAssignmentPage();
    const element = await page.default({ params: Promise.resolve({ assignmentId: "hw-1" }) });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getHomeworkAssignmentByIdMock).toHaveBeenCalledWith("hw-1", "teacher-1");
    expect(screen.getByText("mode:edit")).toBeDefined();
    expect(screen.getByDisplayValue("Initial homework title")).toBeDefined();
    expect(screen.getByLabelText(/class \/ group/i)).toHaveProperty("value", "group-1");
  });

  it("returns notFound for a missing or foreign assignment", async () => {
    getHomeworkAssignmentByIdMock.mockResolvedValueOnce(null);
    const page = await loadEditAssignmentPage();

    await expect(page.default({ params: { assignmentId: "foreign-hw" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getHomeworkAssignmentByIdMock).toHaveBeenCalledWith("foreign-hw", "teacher-1");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders archived assignment as read-only with a clear message", async () => {
    getHomeworkAssignmentByIdMock.mockResolvedValueOnce(
      homeworkAssignment({ archivedAt: new Date("2026-06-01T10:00:00.000Z") }),
    );
    const page = await loadEditAssignmentPage();
    const element = await page.default({ params: { assignmentId: "hw-archived" } });
    render(element);

    expect(screen.getByText(/archived assignment cannot be edited/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });

  it("does not offer foreign class options on edit", async () => {
    listTeacherClassGroupsMock.mockResolvedValueOnce([{ id: "group-1", name: "Algebra Group A" }]);
    const page = await loadEditAssignmentPage();
    const element = await page.default({ params: { assignmentId: "hw-1" } });
    render(element);

    expect(screen.getByRole("option", { name: "Algebra Group A" })).toBeDefined();
    expect(screen.queryByRole("option", { name: /other teacher/i })).toBeNull();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading edit data",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadEditAssignmentPage();

      await expect(page.default({ params: { assignmentId: "hw-1" } })).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(getHomeworkAssignmentByIdMock).not.toHaveBeenCalled();
    },
  );
});
