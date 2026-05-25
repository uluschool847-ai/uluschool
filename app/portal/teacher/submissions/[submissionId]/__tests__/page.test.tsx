import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getSubmissionForTeacherMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  getSubmissionForTeacher: getSubmissionForTeacherMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/app/portal/teacher/components/SubmissionReviewForm", () => ({
  SubmissionReviewForm: ({
    initialFeedback,
    initialGrade,
    submissionId,
  }: {
    initialFeedback?: string | null;
    initialGrade?: number | null;
    submissionId: string;
  }) => (
    <section aria-label="Submission review form mock">
      <p>form submission:{submissionId}</p>
      <p>initial grade:{initialGrade ?? "empty"}</p>
      <p>initial feedback:{initialFeedback ?? "empty"}</p>
      <button type="submit">{initialGrade === null ? "Save grade" : "Update grade"}</button>
    </section>
  ),
}));

type TeacherSubmissionReviewPageModule = {
  default: (props: {
    params: Promise<{ submissionId: string }> | { submissionId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/submissions/[submissionId]/page.tsx";

async function loadTeacherSubmissionReviewPage() {
  const specifier = "@/app/portal/teacher/submissions/[submissionId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherSubmissionReviewPageModule>;
}

function submissionDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    student: {
      id: "student-1",
      fullName: "Amina Yusuf",
      email: "amina@example.com",
    },
    assignment: {
      id: "assignment-1",
      title: "Quadratic homework",
      description: "Solve every quadratic problem.",
      dueDate: new Date("2026-07-12T20:00:00.000Z"),
    },
    scheduledClass: {
      id: "lesson-1",
      title: "Algebra lesson",
    },
    classGroup: {
      id: "group-1",
      name: "Algebra Group A",
      href: "/portal/teacher/classes/group-1",
    },
    subject: {
      id: "subject-1",
      name: "Algebra",
    },
    contentUrl: "https://uploads.example/submissions/quadratic.pdf",
    submittedWorkHref: "https://uploads.example/submissions/quadratic.pdf",
    attachments: [
      {
        id: "attachment-1",
        filename: "quadratic.pdf",
        href: "/uploads/submissions/quadratic.pdf",
      },
    ],
    grade: null,
    feedback: null,
    status: "Pending",
    submittedAt: new Date("2026-07-10T10:00:00.000Z"),
    updatedAt: new Date("2026-07-10T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Teacher submission review page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getSubmissionForTeacherMock.mockResolvedValue(submissionDetail());
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard, repository detail loader, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/submission-repository");
    expect(source).toContain("getSubmissionForTeacher");
    expect(source).not.toContain('requireRole(["TEACHER"])');
    expect(source).not.toContain("requireRole(['TEACHER'])");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("loads the submission with session uid and renders review context", async () => {
    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({
      params: Promise.resolve({ submissionId: "submission-1" }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getSubmissionForTeacherMock).toHaveBeenCalledWith("teacher-1", "submission-1");
    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/amina@example\.com/i)).toBeDefined();
    expect(screen.getByText(/quadratic homework/i)).toBeDefined();
    expect(screen.getByText(/solve every quadratic problem/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/^algebra$/i)).toBeDefined();
    expect(screen.getByText(/pending/i)).toBeDefined();
    expect(screen.getByText(/due/i)).toBeDefined();
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /open submitted work/i })).toHaveAttribute(
      "href",
      "https://uploads.example/submissions/quadratic.pdf",
    );
    expect(screen.getByRole("link", { name: /quadratic\.pdf/i })).toHaveAttribute(
      "href",
      "/uploads/submissions/quadratic.pdf",
    );
    expect(screen.getByRole("link", { name: /back to submissions/i })).toHaveAttribute(
      "href",
      "/portal/teacher/submissions",
    );
    expect(screen.getByRole("link", { name: /class detail|algebra group a/i })).toHaveAttribute(
      "href",
      "/portal/teacher/classes/group-1",
    );
    expect(screen.getByText("form submission:submission-1")).toBeDefined();
  });

  it("renders graded submissions with current grade, feedback, and update form state", async () => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        grade: 91,
        feedback: "Strong solution.",
        status: "Graded",
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-1" } });
    render(element);

    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getAllByText(/91/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/strong solution/i).length).toBeGreaterThan(0);
    expect(screen.getByText("initial grade:91")).toBeDefined();
    expect(screen.getByText("initial feedback:Strong solution.")).toBeDefined();
    expect(screen.getByRole("button", { name: /update grade/i })).toBeDefined();
  });

  it("renders full current feedback on the detail page instead of only a preview", async () => {
    const fullFeedback = `${"Detailed feedback ".repeat(12)}final sentence visible on detail.`;
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        grade: 91,
        feedback: fullFeedback,
        status: "Graded",
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-1" } });
    render(element);

    expect(screen.getByText(`Current feedback: ${fullFeedback}`)).toBeDefined();
  });

  it("renders late submission and resubmission markers when timestamps require them", async () => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        assignment: {
          id: "assignment-1",
          title: "Quadratic homework",
          description: "Solve every quadratic problem.",
          dueDate: new Date("2026-07-10T09:00:00.000Z"),
        },
        submittedAt: new Date("2026-07-10T10:00:00.000Z"),
        updatedAt: new Date("2026-07-10T12:00:00.000Z"),
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-late" } });
    render(element);

    expect(screen.getByText(/late submission/i)).toBeDefined();
    expect(screen.getByText(/resubmitted or updated/i)).toBeDefined();
  });

  it("renders empty states when feedback and submitted work are missing", async () => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        contentUrl: null,
        submittedWorkHref: null,
        attachments: [],
        feedback: null,
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-empty" } });
    render(element);

    expect(screen.getByText(/no feedback/i)).toBeDefined();
    expect(screen.getByText(/submitted work unavailable|no submitted work/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /open submitted work/i })).toBeNull();
  });

  it("allows safe https and uploads submitted work links", async () => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        contentUrl: "/uploads/submissions/quadratic.pdf",
        submittedWorkHref: "/uploads/submissions/quadratic.pdf",
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-upload" } });
    render(element);

    expect(screen.getByRole("link", { name: /open submitted work/i })).toHaveAttribute(
      "href",
      "/uploads/submissions/quadratic.pdf",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,owned",
    "file:///etc/passwd",
    "http://example.com/work.pdf",
  ])("does not render unsafe submitted work URL %s as an active link", async (unsafeUrl) => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        contentUrl: unsafeUrl,
        submittedWorkHref: unsafeUrl,
        attachments: [],
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-unsafe" } });
    render(element);

    expect(screen.queryByRole("link", { name: /open submitted work/i })).toBeNull();
    expect(
      screen.getByText(/submitted work unavailable|invalid submitted work link/i),
    ).toBeDefined();
  });

  it("preserves filtered submissions back link when list query params are present", async () => {
    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({
      params: { submissionId: "submission-1" },
      searchParams: {
        status: "pending",
        classGroupId: "group-1",
        search: "Amina",
      },
    } as never);
    render(element);

    expect(screen.getByRole("link", { name: /back to submissions/i })).toHaveAttribute(
      "href",
      "/portal/teacher/submissions?status=pending&classGroupId=group-1&search=Amina",
    );
  });

  it("does not render an active assignment detail link when no assignment detail route exists", async () => {
    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-1" } });
    render(element);

    expect(screen.queryByRole("link", { name: /quadratic homework/i })).toBeNull();
  });

  it("does not render unsafe submitted work URLs as active links", async () => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(
      submissionDetail({
        contentUrl: "javascript:alert(1)",
        submittedWorkHref: null,
        attachments: [],
      }),
    );

    const page = await loadTeacherSubmissionReviewPage();
    const element = await page.default({ params: { submissionId: "submission-unsafe" } });
    render(element);

    expect(screen.queryByRole("link", { name: /open submitted work/i })).toBeNull();
    expect(
      screen.getByText(/submitted work unavailable|invalid submitted work link/i),
    ).toBeDefined();
  });

  it("returns notFound when repository returns null for missing or foreign submissions", async () => {
    getSubmissionForTeacherMock.mockResolvedValueOnce(null);

    const page = await loadTeacherSubmissionReviewPage();

    await expect(page.default({ params: { submissionId: "foreign-submission" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getSubmissionForTeacherMock).toHaveBeenCalledWith("teacher-1", "foreign-submission");
    expect(notFound).toHaveBeenCalled();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions before loading review data",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      const page = await loadTeacherSubmissionReviewPage();

      await expect(page.default({ params: { submissionId: "submission-1" } })).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(getSubmissionForTeacherMock).not.toHaveBeenCalled();
    },
  );
});
