import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getParentChildGradebookMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getParentChildGradebook: getParentChildGradebookMock,
}));

type ParentGradebookPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/gradebook/[studentId]/page.tsx";

function loadParentGradebookPage() {
  const specifier = "@/app/portal/parent/gradebook/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentGradebookPageModule>;
}

function gradebook(overrides: Record<string, unknown> = {}) {
  return {
    categories: [
      { average: 82, category: "HOMEWORK", label: "Homework" },
      { average: 91, category: "MANUAL", label: "Manual" },
    ],
    categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
    homeworkGrades: [
      {
        category: "HOMEWORK",
        feedback: "Clear method and correct final answer.",
        gradedAt: new Date("2026-03-10T10:00:00.000Z"),
        id: "submission-1",
        score: 82,
        subject: { id: "subject-math", name: "Mathematics" },
        submittedAt: new Date("2026-03-10T10:00:00.000Z"),
        title: "Quadratics homework",
      },
    ],
    manualGradeHistory: [
      {
        archivedAt: new Date("2026-03-14T10:00:00.000Z"),
        category: "MANUAL",
        description: "Earlier draft kept for history.",
        id: "manual-archived",
        score: 50,
        subject: { id: "subject-math", name: "Mathematics" },
        title: "Archived oral checkpoint",
      },
    ],
    manualGrades: [
      {
        category: "MANUAL",
        description: "Confident oral explanation.",
        gradedAt: new Date("2026-03-12T10:00:00.000Z"),
        id: "manual-1",
        score: 91,
        subject: { id: "subject-math", name: "Mathematics" },
        title: "Oral checkpoint",
      },
    ],
    student: { email: "amina@example.com", fullName: "Amina Yusuf", id: "student-1" },
    term: {
      endDate: new Date("2026-06-30T23:59:59.999Z"),
      id: "term-1",
      name: "Spring 2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    },
    termAverage: 84.7,
    ...overrides,
  };
}

describe("Parent child gradebook page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    getParentChildGradebookMock.mockResolvedValue(gradebook());
  });

  afterEach(() => cleanup());

  it("uses PARENT guard, linked-child repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/gradebook-repository");
    expect(source).toContain("getParentChildGradebook(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("passes only session.uid, route studentId, and selected termId to the parent-scoped repository", async () => {
    const page = await loadParentGradebookPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { termId: "term-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentChildGradebookMock).toHaveBeenCalledWith("parent-1", "student-1", "term-1");
    expect(screen.getByRole("heading", { name: /amina yusuf gradebook/i })).toBeDefined();
  });

  it("returns notFound for an unlinked child", async () => {
    getParentChildGradebookMock.mockResolvedValueOnce(null);
    const page = await loadParentGradebookPage();

    await expect(
      page.default({
        params: { studentId: "unlinked-student" },
        searchParams: { termId: "term-1" },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders the finalized read-only gradebook UX", async () => {
    const page = await loadParentGradebookPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { termId: "term-1" },
    });
    render(element);

    expect(screen.getByText("Amina Yusuf")).toBeDefined();
    expect(screen.getByText("Spring 2026")).toBeDefined();
    expect(screen.getByText(/01 Jan 2026/i)).toBeDefined();
    expect(screen.getByText(/30 Jun 2026/i)).toBeDefined();
    expect(screen.getByText(/weighted average/i)).toBeDefined();
    expect(screen.getByText(/84\.7/)).toBeDefined();

    const homework = screen.getByRole("region", { name: /homework/i });
    expect(within(homework).getByText(/weight:\s*70%/i)).toBeDefined();
    expect(within(homework).getByText(/82/)).toBeDefined();
    expect(within(homework).getByText("Quadratics homework")).toBeDefined();
    expect(within(homework).getByText(/clear method/i)).toBeDefined();

    const manual = screen.getByRole("region", { name: /^manual$/i });
    expect(within(manual).getByText(/weight:\s*30%/i)).toBeDefined();
    expect(within(manual).getByText("Oral checkpoint")).toBeDefined();
    expect(within(manual).getByText(/confident oral explanation/i)).toBeDefined();

    const history = screen.getByRole("region", { name: /archived grade history/i });
    expect(within(history).getByText("Archived oral checkpoint")).toBeDefined();
    expect(within(history).getByText(/earlier draft/i)).toBeDefined();
  });

  it("renders empty states for missing homework and manual grades", async () => {
    getParentChildGradebookMock.mockResolvedValueOnce(
      gradebook({
        categories: [
          { average: null, category: "HOMEWORK", label: "Homework" },
          { average: null, category: "MANUAL", label: "Manual" },
        ],
        homeworkGrades: [],
        manualGradeHistory: [],
        manualGrades: [],
        termAverage: null,
      }),
    );
    const page = await loadParentGradebookPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByText(/no homework grades/i)).toBeDefined();
    expect(screen.getByText(/no manual grades/i)).toBeDefined();
    expect(screen.getByText(/no archived manual grade history/i)).toBeDefined();
  });

  it("renders no mutation controls", async () => {
    const page = await loadParentGradebookPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    for (const label of [/create/i, /edit/i, /archive/i, /delete/i, /save/i, /grade/i]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });
});
