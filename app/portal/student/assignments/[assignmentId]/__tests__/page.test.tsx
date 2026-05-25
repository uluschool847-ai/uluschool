import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAssignmentDetailForStudentMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  getAssignmentDetailForStudent: getAssignmentDetailForStudentMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type AssignmentDetailPageModule = {
  default: (props: {
    params: Promise<{ assignmentId: string }> | { assignmentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/assignments/[assignmentId]/page.tsx";

async function loadPage() {
  const specifier = "@/app/portal/student/assignments/[assignmentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<AssignmentDetailPageModule>;
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic equations",
    description: "Show every factoring step.",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    archivedAt: null,
    canSubmit: true,
    canResubmit: false,
    readOnlyReason: null,
    lessonHref: "/portal/student/schedule/lesson-1",
    subject: { id: "subject-math", name: "Mathematics" },
    scheduledClass: { id: "lesson-1", title: "Algebra lesson" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    materials: [
      {
        id: "material-1",
        title: "Lesson notes",
        href: "/uploads/materials/lesson-notes.pdf",
      },
      {
        id: "material-unsafe",
        title: "Unsafe material",
        href: "javascript:alert(1)",
      },
    ],
    currentSubmission: null,
    submissionHistory: [],
    grade: null,
    feedback: null,
    ...overrides,
  };
}

describe("Student assignment detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: UserRole.STUDENT,
      email: "student@example.com",
    });
    getAssignmentDetailForStudentMock.mockResolvedValue(detail());
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the enum STUDENT guard, dedicated repository, and no direct Prisma access", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("@/lib/repositories/submission-repository");
    expect(source).toContain("getAssignmentDetailForStudent");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("requires STUDENT and loads detail by session.uid and route assignmentId", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: Promise.resolve({ assignmentId: "assignment-1" }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getAssignmentDetailForStudentMock).toHaveBeenCalledWith("student-1", "assignment-1");
    expect(screen.getByRole("heading", { name: /quadratic equations/i })).toBeDefined();
    expect(screen.getByText(/show every factoring step/i)).toBeDefined();
    expect(screen.getByText(/20|jun|2026/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics a/i)).toBeDefined();
    expect(screen.getByText(/jane teacher/i)).toBeDefined();
    expect(screen.getByRole("link", { name: "Lesson context" })).toHaveAttribute(
      "href",
      "/portal/student/schedule/lesson-1",
    );
  });

  it("does not trust query or form studentId values", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { assignmentId: "assignment-1" },
      searchParams: { studentId: "student-2" },
    });
    render(element);

    expect(getAssignmentDetailForStudentMock).toHaveBeenCalledWith("student-1", "assignment-1");
    expect(JSON.stringify(getAssignmentDetailForStudentMock.mock.calls)).not.toContain("student-2");
    expect(document.querySelector('input[name="studentId"]')).toBeNull();
  });

  it("returns notFound for foreign or missing assignments", async () => {
    getAssignmentDetailForStudentMock.mockResolvedValueOnce(null);

    const page = await loadPage();

    await expect(
      page.default({ params: Promise.resolve({ assignmentId: "foreign-assignment" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders safe material links and does not activate unsafe material URLs", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { assignmentId: "assignment-1" } });
    render(element);

    const materials = screen.getByRole("region", { name: /materials/i });
    expect(within(materials).getByRole("link", { name: /lesson notes/i })).toHaveAttribute(
      "href",
      "/uploads/materials/lesson-notes.pdf",
    );
    expect(within(materials).queryByRole("link", { name: /unsafe material/i })).toBeNull();
    expect(screen.getByText(/unsafe material/i)).toBeDefined();
  });

  it("renders submission history, grade, feedback, and resubmit form for submitted assignments", async () => {
    getAssignmentDetailForStudentMock.mockResolvedValueOnce(
      detail({
        canResubmit: true,
        currentSubmission: {
          id: "submission-1",
          contentUrl: "https://drive.example.com/work-v1",
          submittedWorkHref: "https://drive.example.com/work-v1",
          submittedAt: "2026-06-19T18:00:00.000Z",
          grade: 91,
          feedback: "Clear method.",
        },
        submissionHistory: [
          {
            id: "submission-1",
            contentUrl: "https://drive.example.com/work-v1",
            submittedWorkHref: "https://drive.example.com/work-v1",
            submittedAt: "2026-06-19T18:00:00.000Z",
            grade: 91,
            feedback: "Clear method.",
            status: "Graded",
          },
        ],
        grade: 91,
        feedback: "Clear method.",
      }),
    );

    const page = await loadPage();
    const element = await page.default({ params: { assignmentId: "assignment-1" } });
    render(element);

    expect(screen.getByText(/submission history/i)).toBeDefined();
    expect(screen.getByText(/91/)).toBeDefined();
    expect(screen.getByText(/clear method/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /resubmit/i })).toBeDefined();
  });

  it("shows a submit form for pending assignments", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { assignmentId: "assignment-1" } });
    render(element);

    expect(screen.getByRole("button", { name: /^submit$/i })).toBeDefined();
  });

  it("renders archived assignments read-only and without an active submit form", async () => {
    getAssignmentDetailForStudentMock.mockResolvedValueOnce(
      detail({
        archivedAt: new Date("2026-06-21T10:00:00.000Z"),
        canSubmit: false,
        canResubmit: false,
        readOnlyReason: "This assignment is archived.",
      }),
    );

    const page = await loadPage();
    const element = await page.default({ params: { assignmentId: "assignment-1" } });
    render(element);

    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^submit$|resubmit/i })).toBeNull();
  });

  it("does not render unsafe submitted work URLs as active links", async () => {
    getAssignmentDetailForStudentMock.mockResolvedValueOnce(
      detail({
        canResubmit: true,
        currentSubmission: {
          id: "submission-unsafe",
          contentUrl: "data:text/html,unsafe",
          submittedWorkHref: null,
          submittedAt: "2026-06-19T18:00:00.000Z",
          grade: null,
          feedback: null,
        },
        submissionHistory: [
          {
            id: "submission-unsafe",
            contentUrl: "data:text/html,unsafe",
            submittedWorkHref: null,
            submittedAt: "2026-06-19T18:00:00.000Z",
            grade: null,
            feedback: null,
            status: "Pending",
          },
        ],
      }),
    );

    const page = await loadPage();
    const element = await page.default({ params: { assignmentId: "assignment-1" } });
    render(element);

    expect(screen.queryByRole("link", { name: /submitted work|view work/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain('href="data:text/html,unsafe"');
  });
});
