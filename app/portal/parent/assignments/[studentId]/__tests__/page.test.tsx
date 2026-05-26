import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAssignmentsForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/parent-assignment-repository", () => ({
  listAssignmentsForParentChild: listAssignmentsForParentChildMock,
}));

type ParentAssignmentsPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/assignments/[studentId]/page.tsx";

function loadPage() {
  const specifier = "@/app/portal/parent/assignments/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentAssignmentsPageModule>;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    descriptionPreview: "Solve questions 1-10 from the workbook.",
    detailHref: "/portal/parent/assignments/student-1/assignment-1",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    feedbackPreview: "Clear method. Check final notation.",
    grade: 91,
    id: "assignment-1",
    scheduledClass: { id: "lesson-1", title: "Algebra lesson" },
    status: "Graded",
    subject: { id: "subject-math", name: "Mathematics" },
    title: "Quadratic equations",
    ...overrides,
  };
}

function assignmentSet() {
  return [
    assignment({
      feedbackPreview: null,
      grade: null,
      id: "active-assignment",
      status: "Not submitted",
      title: "Active algebra homework",
    }),
    assignment({
      feedbackPreview: null,
      grade: null,
      id: "submitted-assignment",
      status: "Submitted",
      title: "Submitted geometry homework",
    }),
    assignment(),
    assignment({
      dueDate: new Date("2020-01-01T20:00:00.000Z"),
      feedbackPreview: null,
      grade: null,
      id: "missing-assignment",
      status: "Missing",
      title: "Missing trigonometry homework",
    }),
    assignment({
      archivedAt: new Date("2026-06-21T10:00:00.000Z"),
      feedbackPreview: null,
      grade: null,
      id: "archived-assignment",
      status: "Archived",
      title: "Archived statistics homework",
    }),
  ];
}

describe("Parent child assignments page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    listAssignmentsForParentChildMock.mockResolvedValue(assignmentSet());
  });

  afterEach(() => cleanup());

  it("uses the PARENT guard, dedicated parent assignment repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-assignment-repository");
    expect(source).toContain("listAssignmentsForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("SubmitWorkForm");
    expect(source).not.toContain("submitWorkAction");
  });

  it("renders back navigation and all parent assignment filters", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByRole("link", { name: /back to parent dashboard/i })).toHaveAttribute(
      "href",
      "/portal/parent",
    );
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/class group/i)).toBeDefined();
    expect(screen.getByLabelText(/scheduled class|class$/i)).toBeDefined();
    expect(screen.getByLabelText(/search/i)).toBeDefined();
    expect(screen.getByLabelText(/due from/i)).toBeDefined();
    expect(screen.getByLabelText(/due to/i)).toBeDefined();
    expect(screen.getByLabelText(/sort/i)).toBeDefined();
  });

  it("lists assignments for the linked child using session.uid and route studentId", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { search: "quadratic", status: "graded" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(listAssignmentsForParentChildMock).toHaveBeenCalledWith("parent-1", "student-1", {
      search: "quadratic",
      status: "graded",
    });
    expect(screen.getByRole("heading", { name: /assignments/i })).toBeDefined();
    expect(screen.getByText(/quadratic equations/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/20|jun|2026/i)).toBeDefined();
    expect(screen.getByText(/grade:\s*91/i)).toBeDefined();
    expect(screen.getByText(/clear method/i)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /view assignment|open assignment|details/i }),
    ).toHaveAttribute("href", "/portal/parent/assignments/student-1/assignment-1");
  });

  it("renders all parent-visible assignment statuses and the Missing reminder without inventing overdue status", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { status: "all" },
    });
    render(element);

    for (const status of ["Not submitted", "Submitted", "Graded", "Missing", "Archived"]) {
      expect(screen.getByText(new RegExp(status, "i"))).toBeDefined();
    }
    expect(screen.getByText(/missing trigonometry homework/i)).toBeDefined();
    expect(screen.getByText(/read-only|overdue|missing/i)).toBeDefined();
    expect(screen.queryByText(/^overdue$/i)).toBeNull();
    expect(screen.queryByText(/foreign assignment/i)).toBeNull();
  });

  it("renders the parent assignment list as read-only without student or teacher mutation controls", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(
      screen.queryByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/work link|submission url|feedback|grade/i)).toBeNull();
    expect(screen.queryByText(/submit homework|resubmit work|archive assignment/i)).toBeNull();
  });

  it("renders an empty state for unlinked or assignment-free children", async () => {
    listAssignmentsForParentChildMock.mockResolvedValueOnce([]);
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "unlinked-student" } });
    render(element);

    expect(screen.getByText(/no assignments available|no homework available/i)).toBeDefined();
    expect(screen.queryByText(/foreign assignment/i)).toBeNull();
  });

  it("rejects non-parent roles before loading assignment data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadPage();

    await expect(page.default({ params: { studentId: "student-1" } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(listAssignmentsForParentChildMock).not.toHaveBeenCalled();
  });
});
