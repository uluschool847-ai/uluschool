import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getAssignmentDetailForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/repositories/parent-assignment-repository", () => ({
  getAssignmentDetailForParentChild: getAssignmentDetailForParentChildMock,
}));

type ParentAssignmentDetailPageModule = {
  default: (props: {
    params:
      | Promise<{ assignmentId: string; studentId: string }>
      | { assignmentId: string; studentId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/assignments/[studentId]/[assignmentId]/page.tsx";

function loadPage() {
  const specifier = "@/app/portal/parent/assignments/[studentId]/[assignmentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentAssignmentDetailPageModule>;
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    backHref: "/portal/parent/assignments/student-1",
    canResubmit: false,
    canSubmit: false,
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    currentSubmission: {
      feedback: "Strong structure. Improve final notation.",
      grade: 91,
      id: "submission-2",
      submittedAt: new Date("2026-06-19T18:00:00.000Z"),
      submittedWorkHref: "https://drive.example.com/work-v2",
    },
    description: "Solve questions 1-10 from the workbook.",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    feedback: "Strong structure. Improve final notation.",
    grade: 91,
    id: "assignment-1",
    materials: [
      { href: "https://cdn.example.com/algebra.pdf", id: "material-https", title: "Algebra PDF" },
      {
        href: "/uploads/materials/algebra-upload.pdf",
        id: "material-upload",
        title: "Uploaded PDF",
      },
      { href: "javascript:alert(1)", id: "material-js", title: "Unsafe JavaScript" },
      { href: "data:text/html,unsafe", id: "material-data", title: "Unsafe Data" },
      { href: "file:///C:/secret.pdf", id: "material-file", title: "Unsafe File" },
      { href: "http://cdn.example.com/insecure.pdf", id: "material-http", title: "Unsafe HTTP" },
    ],
    readOnlyReason: "Parents can view assignment progress but cannot submit work.",
    scheduledClass: { id: "lesson-1", title: "Algebra lesson" },
    status: "Graded",
    subject: { id: "subject-math", name: "Mathematics" },
    submissionHistory: [
      {
        feedback: "Strong structure. Improve final notation.",
        grade: 91,
        id: "submission-2",
        status: "Graded",
        submittedAt: new Date("2026-06-19T18:00:00.000Z"),
        submittedWorkHref: "https://drive.example.com/work-v2",
      },
      {
        feedback: null,
        grade: null,
        id: "submission-1",
        status: "Submitted",
        submittedAt: new Date("2026-06-18T18:00:00.000Z"),
        submittedWorkHref: "https://drive.example.com/work-v1",
      },
    ],
    teacher: { fullName: "Jane Teacher", id: "teacher-1" },
    title: "Quadratic equations",
    ...overrides,
  };
}

describe("Parent child assignment detail page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    getAssignmentDetailForParentChildMock.mockResolvedValue(detail());
  });

  afterEach(() => cleanup());

  it("uses the PARENT guard, dedicated parent assignment repository, and no mutation imports", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-assignment-repository");
    expect(source).toContain("getAssignmentDetailForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("SubmitWorkForm");
    expect(source).not.toContain("submitWorkAction");
  });

  it("renders linked-child assignment detail with due date, history, grade, and feedback", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { assignmentId: "assignment-1", studentId: "student-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getAssignmentDetailForParentChildMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      "assignment-1",
    );
    expect(screen.getByRole("heading", { name: /quadratic equations/i })).toBeDefined();
    expect(screen.getByText(/solve questions 1-10/i)).toBeDefined();
    expect(screen.getByText(/due|20|jun|2026/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics a/i)).toBeDefined();
    expect(screen.getByText(/submission history/i)).toBeDefined();
    expect(screen.getByText(/grade:\s*91/i)).toBeDefined();
    expect(screen.getByText(/strong structure/i)).toBeDefined();
    expect(screen.getAllByRole("link", { name: /view work/i })).toHaveLength(2);
  });

  it("renders active links only for https and /uploads material or submission URLs", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { assignmentId: "assignment-1", studentId: "student-1" },
    });
    render(element);

    expect(screen.getByRole("link", { name: /algebra pdf/i })).toHaveAttribute(
      "href",
      "https://cdn.example.com/algebra.pdf",
    );
    expect(screen.getByRole("link", { name: /uploaded pdf/i })).toHaveAttribute(
      "href",
      "/uploads/materials/algebra-upload.pdf",
    );
    expect(screen.queryByRole("link", { name: /unsafe javascript/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe data/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe file/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe http/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain('href="javascript:alert(1)"');
    expect(document.body.innerHTML).not.toContain('href="data:text/html,unsafe"');
    expect(document.body.innerHTML).not.toContain('href="file:///C:/secret.pdf"');
    expect(document.body.innerHTML).not.toContain('href="http://cdn.example.com/insecure.pdf"');
  });

  it("renders archived assignments as read-only", async () => {
    getAssignmentDetailForParentChildMock.mockResolvedValueOnce(
      detail({
        archivedAt: new Date("2026-06-21T10:00:00.000Z"),
        currentSubmission: null,
        readOnlyReason: "This assignment is archived.",
        status: "Archived",
        submissionHistory: [],
      }),
    );
    const page = await loadPage();
    const element = await page.default({
      params: { assignmentId: "assignment-archived", studentId: "student-1" },
    });
    render(element);

    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.getByText(/read-only/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^submit$|resubmit/i })).toBeNull();
  });

  it("is read-only for parents and does not expose submit, resubmit, edit, archive, or grading controls", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { assignmentId: "assignment-1", studentId: "student-1" },
    });
    render(element);

    expect(screen.getByText(/parents can view assignment progress/i)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/work link|submission url|feedback|grade/i)).toBeNull();
    expect(
      screen.queryByText(/submit work|resubmit work|archive assignment|save grade/i),
    ).toBeNull();
  });

  it("returns notFound for an unlinked child or foreign assignment", async () => {
    getAssignmentDetailForParentChildMock.mockResolvedValueOnce(null);
    const page = await loadPage();

    await expect(
      page.default({ params: { assignmentId: "foreign-assignment", studentId: "unlinked-child" } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
