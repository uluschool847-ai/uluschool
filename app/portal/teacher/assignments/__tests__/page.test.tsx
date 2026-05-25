import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listHomeworkAssignmentsForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/homework-repository", () => ({
  listHomeworkAssignmentsForTeacher: listHomeworkAssignmentsForTeacherMock,
}));

type AssignmentsPageModule = {
  default: (props: {
    searchParams?:
      | Promise<{
          classGroupId?: string;
          dueDateFrom?: string;
          dueDateTo?: string;
          search?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
        }>
      | {
          classGroupId?: string;
          dueDateFrom?: string;
          dueDateTo?: string;
          search?: string;
          sort?: string;
          status?: string;
          subjectId?: string;
        };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/assignments/page.tsx";

async function loadAssignmentsPage() {
  const specifier = "@/app/portal/teacher/assignments/page";
  return import(/* @vite-ignore */ specifier) as Promise<AssignmentsPageModule>;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "hw-1",
    title: "Quadratic equations homework",
    description: "Solve workbook questions 1-10.",
    dueDate: new Date("2026-06-22T20:00:00.000Z"),
    archivedAt: null,
    subject: { id: "subject-math", name: "Mathematics" },
    scheduledClass: {
      id: "lesson-1",
      title: "Algebra Group A",
      classGroup: { id: "group-1", name: "Algebra Group A" },
    },
    submissionsCount: 4,
    pendingSubmissionsCount: 2,
    gradedSubmissionsCount: 1,
    editHref: "/portal/teacher/assignments/hw-1/edit",
    submissionsHref: "/portal/teacher/submissions?assignmentId=hw-1",
    ...overrides,
  };
}

describe("Teacher assignments list page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listHomeworkAssignmentsForTeacherMock.mockResolvedValue([assignment()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard and the dedicated homework repository", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/homework-repository");
    expect(source).toContain("listHomeworkAssignmentsForTeacher");
    expect(source).not.toContain('requireRole(["TEACHER"])');
    expect(source).not.toContain("requireRole(['TEACHER'])");
  });

  it("requires TEACHER and forwards assignment filters to the repository", async () => {
    const page = await loadAssignmentsPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        classGroupId: "group-1",
        search: "quadratic",
        status: "archived",
        subjectId: "subject-math",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listHomeworkAssignmentsForTeacherMock).toHaveBeenCalledWith("teacher-1", {
      classGroupId: "group-1",
      search: "quadratic",
      status: "archived",
      subjectId: "subject-math",
    });
  });

  it("forwards due date range and supported sort filters to the repository", async () => {
    const page = await loadAssignmentsPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        dueDateFrom: "2026-06-01",
        dueDateTo: "2026-06-30",
        sort: "pendingSubmissions",
      }),
    });
    render(element);

    expect(listHomeworkAssignmentsForTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({
        dueDateFrom: "2026-06-01",
        dueDateTo: "2026-06-30",
        sort: "pendingSubmissions",
      }),
    );
  });

  it.each(["dueDateAsc", "dueDateDesc", "title", "classGroup", "pendingSubmissions"])(
    "forwards supported sort value %s",
    async (sort) => {
      const page = await loadAssignmentsPage();
      const element = await page.default({ searchParams: { sort } });
      render(element);

      expect(listHomeworkAssignmentsForTeacherMock).toHaveBeenCalledWith(
        "teacher-1",
        expect.objectContaining({ sort }),
      );
    },
  );

  it("falls back safely for invalid sort and invalid due date filters", async () => {
    const page = await loadAssignmentsPage();
    const element = await page.default({
      searchParams: {
        dueDateFrom: "not-a-date",
        dueDateTo: "2026-99-99",
        sort: "delete-everything",
      },
    });
    render(element);

    const [, filters] = listHomeworkAssignmentsForTeacherMock.mock.calls.at(-1) ?? [];
    expect(filters).not.toMatchObject({
      dueDateFrom: "not-a-date",
      dueDateTo: "2026-99-99",
      sort: "delete-everything",
    });
  });

  it("renders active assignments by default and hides archived records unless filtered", async () => {
    listHomeworkAssignmentsForTeacherMock.mockResolvedValueOnce([
      assignment(),
      assignment({
        id: "hw-archived",
        title: "Archived revision pack",
        archivedAt: new Date("2026-06-01T10:00:00.000Z"),
      }),
    ]);

    const page = await loadAssignmentsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(listHomeworkAssignmentsForTeacherMock).toHaveBeenCalledWith(
      "teacher-1",
      expect.objectContaining({ status: "active" }),
    );
    expect(screen.getByText(/quadratic equations homework/i)).toBeDefined();
    expect(screen.queryByText(/archived revision pack/i)).toBeNull();
  });

  it("renders archived assignments with the archived filter", async () => {
    listHomeworkAssignmentsForTeacherMock.mockResolvedValueOnce([
      assignment({
        id: "hw-archived",
        title: "Archived revision pack",
        archivedAt: new Date("2026-06-01T10:00:00.000Z"),
      }),
    ]);

    const page = await loadAssignmentsPage();
    const element = await page.default({ searchParams: { status: "archived" } });
    render(element);

    expect(screen.getByText(/archived revision pack/i)).toBeDefined();
    expect(screen.getAllByText(/^archived$/i).length).toBeGreaterThan(0);
  });

  it("renders assignment metadata and teacher actions without delete wording", async () => {
    const page = await loadAssignmentsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /homework assignments/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /create homework/i })).toHaveAttribute(
      "href",
      "/portal/teacher/assignments/new",
    );
    expect(screen.getByText(/quadratic equations homework/i)).toBeDefined();
    expect(screen.getByText(/solve workbook questions 1-10/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/submissions:\s*4/i)).toBeDefined();
    expect(screen.getByText(/pending:\s*2/i)).toBeDefined();
    expect(screen.getByText(/graded:\s*1/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/portal/teacher/assignments/hw-1/edit",
    );
    expect(screen.getByRole("button", { name: /archive/i })).toBeDefined();
    expect(screen.queryByRole("link", { name: /^view$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /view submissions/i })).toHaveAttribute("disabled");
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByText(/\bdelete\b/i)).toBeNull();
  });

  it("does not render an active edit link for archived assignments", async () => {
    listHomeworkAssignmentsForTeacherMock.mockResolvedValueOnce([
      assignment({
        id: "hw-archived",
        title: "Archived revision pack",
        archivedAt: new Date("2026-06-01T10:00:00.000Z"),
      }),
    ]);

    const page = await loadAssignmentsPage();
    const element = await page.default({ searchParams: { status: "archived" } });
    render(element);

    expect(screen.getByText(/archived revision pack/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /edit/i })).toBeNull();
  });

  it("renders an explicit empty state for no assignments", async () => {
    listHomeworkAssignmentsForTeacherMock.mockResolvedValueOnce([]);

    const page = await loadAssignmentsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no homework assignments/i)).toBeDefined();
  });
});
