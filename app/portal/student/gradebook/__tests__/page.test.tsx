import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getStudentGradebookMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getStudentGradebook: getStudentGradebookMock,
}));

type StudentGradebookPageModule = {
  default: (props: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadStudentGradebookPage() {
  const specifier = "@/app/portal/student/gradebook/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentGradebookPageModule>;
}

describe("Student gradebook page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "student-1", role: UserRole.STUDENT });
    getStudentGradebookMock.mockResolvedValue({
      categories: [
        { category: "HOMEWORK", label: "Homework", average: 82 },
        { category: "MANUAL", label: "Manual", average: 91 },
      ],
      categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
      homeworkGrades: [
        {
          category: "HOMEWORK",
          feedback: "Clear method and correct final answer.",
          gradedAt: new Date("2026-03-10T10:00:00.000Z"),
          id: "submission-1",
          score: 82,
          subject: { id: "subject-1", name: "Algebra" },
          submittedAt: new Date("2026-03-09T10:00:00.000Z"),
          title: "Quadratics homework",
        },
      ],
      manualGrades: [
        {
          category: "MANUAL",
          description: "Excellent oral explanation.",
          gradedAt: new Date("2026-03-12T10:00:00.000Z"),
          id: "manual-1",
          score: 91,
          subject: { id: "subject-1", name: "Algebra" },
          title: "Oral checkpoint",
        },
      ],
      manualGradeHistory: [
        {
          archivedAt: new Date("2026-03-20T10:00:00.000Z"),
          category: "MANUAL",
          description: "Archived draft mark.",
          gradedAt: new Date("2026-03-08T10:00:00.000Z"),
          id: "manual-archived",
          score: 50,
          subject: { id: "subject-1", name: "Algebra" },
          title: "Archived oral checkpoint",
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
    });
  });

  afterEach(() => cleanup());

  it("uses the STUDENT guard, scoped repository, and no direct Prisma access", async () => {
    const source = readFileSync("app/portal/student/gradebook/page.tsx", "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("getStudentGradebook");
    expect(source).not.toContain("prisma.");
  });

  it("requires STUDENT and renders the selected term gradebook UX for the session student", async () => {
    const page = await loadStudentGradebookPage();
    const element = await page.default({ searchParams: { termId: "term-1" } });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getStudentGradebookMock).toHaveBeenCalledWith("student-1", "term-1");
    expect(screen.getByRole("heading", { name: /gradebook/i })).toBeDefined();
    expect(screen.getByText(/spring 2026/i)).toBeDefined();
    expect(screen.getByText(/01 january 2026/i)).toBeDefined();
    expect(screen.getByText(/30 june 2026/i)).toBeDefined();
    expect(screen.getByText(/term average:\s*84\.7/i)).toBeDefined();

    const homeworkCard = screen.getByRole("region", { name: /homework/i });
    expect(homeworkCard.textContent).toMatch(/weight:\s*70%/i);
    expect(homeworkCard.textContent).toMatch(/average:\s*82/i);
    expect(homeworkCard.textContent).toContain("Quadratics homework");
    expect(homeworkCard.textContent).toContain("Algebra");
    expect(homeworkCard.textContent).toMatch(/score:\s*82/i);
    expect(homeworkCard.textContent).toContain("Clear method and correct final answer.");

    const manualCard = screen.getByRole("region", { name: /manual/i });
    expect(manualCard.textContent).toMatch(/weight:\s*30%/i);
    expect(manualCard.textContent).toMatch(/average:\s*91/i);
    expect(manualCard.textContent).toContain("Oral checkpoint");
    expect(manualCard.textContent).toContain("Excellent oral explanation.");
    expect(screen.queryByText(/archived oral checkpoint/i)).toBeNull();
  });

  it("renders category-specific empty states without crashing on missing termId", async () => {
    getStudentGradebookMock.mockResolvedValueOnce({
      categories: [
        { category: "HOMEWORK", label: "Homework", average: null },
        { category: "MANUAL", label: "Manual", average: null },
      ],
      categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
      homeworkGrades: [],
      manualGrades: [],
      manualGradeHistory: [],
      student: { id: "student-1", fullName: "Amina Yusuf" },
      term: {
        endDate: new Date("2026-06-30T23:59:59.999Z"),
        id: "term-1",
        name: "Spring 2026",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      termAverage: null,
    });

    const page = await loadStudentGradebookPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(getStudentGradebookMock).toHaveBeenCalledWith("student-1", "");
    expect(screen.getByText(/no grade average yet/i)).toBeDefined();
    expect(screen.getByText(/no homework grades yet/i)).toBeDefined();
    expect(screen.getByText(/no manual grades yet/i)).toBeDefined();
  });

  it("renders a no gradebook data state when the repository returns null", async () => {
    getStudentGradebookMock.mockResolvedValueOnce(null);

    const page = await loadStudentGradebookPage();
    const element = await page.default({ searchParams: { termId: "missing-term" } });
    render(element);

    expect(screen.getByText(/no gradebook data yet/i)).toBeDefined();
  });

  it("rejects wrong roles before loading student gradebook data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const page = await loadStudentGradebookPage();

    await expect(page.default({ searchParams: { termId: "term-1" } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(getStudentGradebookMock).not.toHaveBeenCalled();
  });
});
