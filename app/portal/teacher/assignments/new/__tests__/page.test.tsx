import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherClassGroupsMock = vi.hoisted(() => vi.fn());
const getSubjectsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-classes-repository", () => ({
  listTeacherClassGroups: listTeacherClassGroupsMock,
}));

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getSubjects: getSubjectsMock,
}));

vi.mock("@/app/portal/teacher/components/HomeworkForm", () => ({
  HomeworkForm: ({
    classes,
    disabled,
    initialValues,
    mode,
    subjects,
  }: {
    classes: Array<{ id: string; name: string }>;
    disabled?: boolean;
    initialValues?: { classId?: string };
    mode: string;
    subjects: Array<{ id: string; name: string }>;
  }) => (
    <section aria-label="Homework form mock">
      <p>mode:{mode}</p>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      <label htmlFor="description">Description</label>
      <textarea id="description" name="description" />
      <label htmlFor="classId">Class / group</label>
      <select id="classId" name="classId" defaultValue={initialValues?.classId ?? ""}>
        <option value="">Select class</option>
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
      <label htmlFor="dueDate">Due date</label>
      <input id="dueDate" name="dueDate" />
      <button disabled={disabled} type="submit">
        Create homework
      </button>
      <a href="/portal/teacher/assignments">Cancel</a>
    </section>
  ),
}));

type NewAssignmentPageModule = {
  default: (props: {
    searchParams?: Promise<{ classGroupId?: string }> | { classGroupId?: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/assignments/new/page.tsx";

async function loadNewAssignmentPage() {
  const specifier = "@/app/portal/teacher/assignments/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<NewAssignmentPageModule>;
}

describe("Teacher assignment create page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listTeacherClassGroupsMock.mockResolvedValue([
      { id: "group-1", name: "Algebra Group A" },
      { id: "group-2", name: "Geometry Group B" },
    ]);
    getSubjectsMock.mockResolvedValue([
      { id: "subject-math", name: "Mathematics" },
      { id: "subject-physics", name: "Physics" },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard and teacher-owned option loaders", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("listTeacherClassGroups");
    expect(source).toContain("HomeworkForm");
    expect(source).not.toContain('requireRole(["TEACHER"])');
  });

  it("requires TEACHER and loads only the signed-in teacher class/group options", async () => {
    const page = await loadNewAssignmentPage();
    const element = await page.default({ searchParams: Promise.resolve({}) });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherClassGroupsMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({ status: "ACTIVE" }),
    );
    expect(getSubjectsMock).toHaveBeenCalled();
    expect(screen.getByText("mode:create")).toBeDefined();
    expect(screen.getByRole("option", { name: "Algebra Group A" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Geometry Group B" })).toBeDefined();
    expect(screen.queryByRole("option", { name: /other teacher/i })).toBeNull();
  });

  it("renders create form controls with subject select and cancel link", async () => {
    const page = await loadNewAssignmentPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByLabelText(/title/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/class \/ group/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/due date/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create homework/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /cancel/i })).toHaveAttribute(
      "href",
      "/portal/teacher/assignments",
    );
  });

  it("preselects classGroupId from query params", async () => {
    const page = await loadNewAssignmentPage();
    const element = await page.default({ searchParams: { classGroupId: "group-2" } });
    render(element);

    expect(screen.getByLabelText(/class \/ group/i)).toHaveProperty("value", "group-2");
  });

  it("shows a no-classes empty state and disables create when teacher has no class groups", async () => {
    listTeacherClassGroupsMock.mockResolvedValueOnce([]);

    const page = await loadNewAssignmentPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no classes available for homework/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create homework/i })).toHaveAttribute("disabled");
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading create form data",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadNewAssignmentPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listTeacherClassGroupsMock).not.toHaveBeenCalled();
    },
  );
});
