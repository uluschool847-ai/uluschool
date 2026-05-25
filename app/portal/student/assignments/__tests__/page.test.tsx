import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAssignmentsForStudentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  listAssignmentsForStudent: listAssignmentsForStudentMock,
}));

type StudentAssignmentsPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/assignments/page.tsx";

async function loadPage() {
  const specifier = "@/app/portal/student/assignments/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentAssignmentsPageModule>;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic equations",
    descriptionPreview: "Solve questions 1-10 from the workbook.",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    status: "Not submitted",
    grade: null,
    feedbackPreview: null,
    detailHref: "/portal/student/assignments/assignment-1",
    subject: { id: "subject-math", name: "Mathematics" },
    scheduledClass: { id: "lesson-1", title: "Algebra lesson" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    ...overrides,
  };
}

describe("Student assignments list page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: UserRole.STUDENT,
      email: "student@example.com",
    });
    listAssignmentsForStudentMock.mockResolvedValue([assignment()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the enum STUDENT guard, dedicated repository, and no direct Prisma or legacy homework API", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("@/lib/repositories/submission-repository");
    expect(source).toContain("listAssignmentsForStudent");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("listStudentHomework");
    expect(source).not.toContain("@/lib/repositories/portal-repository");
  });

  it("requires STUDENT, defaults to active assignments, and renders assignment cards", async () => {
    const page = await loadPage();
    const element = await page.default({ searchParams: Promise.resolve({}) });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listAssignmentsForStudentMock).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({ status: "active" }),
    );
    expect(screen.getByRole("heading", { name: /^assignments$/i })).toBeDefined();
    const assignmentCard = screen.getByText("Quadratic equations").closest("article");
    expect(assignmentCard).not.toBeNull();
    const card = within(assignmentCard as HTMLElement);

    expect(card.getByText("Quadratic equations")).toBeDefined();
    expect(card.getByText(/solve questions 1-10/i)).toBeDefined();
    expect(card.getByText(/algebra lesson/i)).toBeDefined();
    expect(card.getByText(/igcse mathematics a/i)).toBeDefined();
    expect(card.getByText(/subject:\s*mathematics/i)).toBeDefined();
    expect(card.getByText(/20|jun|2026/i)).toBeDefined();
    expect(card.getByText(/not submitted/i)).toBeDefined();
    expect(card.getByRole("link", { name: /view assignment|open assignment/i })).toHaveAttribute(
      "href",
      "/portal/student/assignments/assignment-1",
    );
  });

  it("forwards all supported filters to the repository using session.uid", async () => {
    const page = await loadPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        classGroupId: "group-1",
        dueFrom: "2026-06-01",
        dueTo: "2026-06-30",
        scheduledClassId: "lesson-1",
        search: "quadratic",
        sort: "dueDateAsc",
        status: "graded",
        subjectId: "subject-math",
      }),
    });
    render(element);

    expect(listAssignmentsForStudentMock).toHaveBeenCalledWith("student-1", {
      classGroupId: "group-1",
      dueFrom: "2026-06-01",
      dueTo: "2026-06-30",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "dueDateAsc",
      status: "graded",
      subjectId: "subject-math",
    });
  });

  it("renders filter controls with the selected values", async () => {
    const page = await loadPage();
    const element = await page.default({
      searchParams: {
        search: "quadratic",
        sort: "title",
        status: "submitted",
        subjectId: "subject-math",
      },
    });
    render(element);

    expect(screen.getByLabelText(/status/i)).toHaveProperty("value", "submitted");
    expect(screen.getByLabelText(/subject/i)).toHaveProperty("value", "subject-math");
    expect(screen.getByLabelText(/search/i)).toHaveProperty("value", "quadratic");
    expect(screen.getByLabelText(/sort/i)).toHaveProperty("value", "title");
  });

  it.each([
    ["Submitted", "Submitted"],
    ["Graded", "Graded"],
    ["Missing", "Missing"],
    ["Archived", "Archived"],
  ])("renders %s status badge", async (_name, status) => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([
      assignment({
        id: `assignment-${status.toLowerCase()}`,
        status,
        grade: status === "Graded" ? 88 : null,
        feedbackPreview: status === "Graded" ? "Strong method." : null,
      }),
    ]);

    const page = await loadPage();
    const element = await page.default({ searchParams: { status: status.toLowerCase() } });
    render(element);

    expect(screen.getByText(status)).toBeDefined();
    if (status === "Graded") {
      expect(screen.getByText(/88/)).toBeDefined();
      expect(screen.getByText(/strong method/i)).toBeDefined();
    }
  });

  it("renders overdue reminder copy for Missing assignments", async () => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([
      assignment({
        dueDate: new Date("2020-01-01T10:00:00.000Z"),
        status: "Missing",
      }),
    ]);

    const page = await loadPage();
    const element = await page.default({ searchParams: { status: "missing" } });
    render(element);

    const assignmentCard = screen.getByText("Quadratic equations").closest("article");
    expect(assignmentCard).not.toBeNull();
    const card = within(assignmentCard as HTMLElement);

    expect(card.getByText("Missing")).toBeDefined();
    expect(
      card.getByText(/reminder:\s*this assignment is overdue\. submit it as soon as possible\./i),
    ).toBeDefined();
  });

  it("does not render overdue reminder copy for submitted, graded, future, or archived assignments", async () => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([
      assignment({ id: "future", status: "Not submitted" }),
      assignment({ id: "submitted", status: "Submitted" }),
      assignment({ id: "graded", status: "Graded", grade: 88, feedbackPreview: "Strong method." }),
      assignment({ id: "archived", status: "Archived" }),
    ]);

    const page = await loadPage();
    const element = await page.default({ searchParams: { status: "all" } });
    render(element);

    expect(screen.queryByText(/this assignment is overdue/i)).toBeNull();
  });

  it("does not show archived assignments in the default active view", async () => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([
      assignment(),
      assignment({
        id: "assignment-archived",
        title: "Archived revision pack",
        status: "Archived",
        archivedAt: new Date("2026-06-01T10:00:00.000Z"),
      }),
    ]);

    const page = await loadPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText("Quadratic equations")).toBeDefined();
    expect(screen.queryByText("Archived revision pack")).toBeNull();
  });

  it("renders filtered and unfiltered empty states", async () => {
    listAssignmentsForStudentMock.mockResolvedValueOnce([]);
    const page = await loadPage();
    const filtered = await page.default({ searchParams: { status: "graded" } });
    const { unmount } = render(filtered);

    expect(screen.getByText("No assignments match the selected filters.")).toBeDefined();

    unmount();
    listAssignmentsForStudentMock.mockResolvedValueOnce([]);
    const unfiltered = await page.default({ searchParams: {} });
    render(unfiltered);

    expect(screen.getByText("No assignments yet.")).toBeDefined();
  });

  it("rejects wrong roles before loading assignments", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const page = await loadPage();

    await expect(page.default({ searchParams: {} })).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listAssignmentsForStudentMock).not.toHaveBeenCalled();
  });
});
