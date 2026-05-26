import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

type ParentAssignmentDetailProps = {
  assignment: Record<string, unknown>;
};

type ParentAssignmentDetailModule = {
  ParentAssignmentDetail: ComponentType<ParentAssignmentDetailProps>;
};

function loadComponent() {
  const specifier =
    "@/app/portal/parent/assignments/[studentId]/[assignmentId]/ParentAssignmentDetail";
  return import(/* @vite-ignore */ specifier) as Promise<ParentAssignmentDetailModule>;
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
      submittedAt: "2026-06-19T18:00:00.000Z",
      submittedWorkHref: "https://drive.example.com/work-v2",
    },
    description: "Solve questions 1-10 from the workbook.",
    dueDate: "2026-06-20T20:00:00.000Z",
    feedback: "Strong structure. Improve final notation.",
    grade: 91,
    id: "assignment-1",
    materials: [
      { href: "https://cdn.example.com/algebra.pdf", id: "material-https", title: "Hosted PDF" },
      { href: "/uploads/materials/algebra.pdf", id: "material-1", title: "Algebra PDF" },
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
        submittedAt: "2026-06-19T18:00:00.000Z",
        submittedWorkHref: "https://drive.example.com/work-v2",
      },
      {
        feedback: null,
        grade: null,
        id: "submission-1",
        status: "Submitted",
        submittedAt: "2026-06-18T18:00:00.000Z",
        submittedWorkHref: "https://drive.example.com/work-v1",
      },
    ],
    teacher: { fullName: "Jane Teacher", id: "teacher-1" },
    title: "Quadratic equations",
    ...overrides,
  };
}

describe("ParentAssignmentDetail", () => {
  afterEach(() => cleanup());

  it("renders assignment detail with status, due date, materials, submission history, grade, and feedback", async () => {
    const { ParentAssignmentDetail } = await loadComponent();
    render(<ParentAssignmentDetail assignment={detail()} />);

    expect(screen.getByRole("heading", { name: /quadratic equations/i })).toBeDefined();
    expect(screen.getByText(/solve questions 1-10/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/20|jun|2026/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics a/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /hosted pdf/i })).toHaveAttribute(
      "href",
      "https://cdn.example.com/algebra.pdf",
    );
    expect(screen.getByRole("link", { name: /algebra pdf/i })).toHaveAttribute(
      "href",
      "/uploads/materials/algebra.pdf",
    );
    expect(screen.getByText(/submission history/i)).toBeDefined();
    expect(screen.getByText(/submitted/i)).toBeDefined();
    expect(screen.getByText(/grade:\s*91/i)).toBeDefined();
    expect(screen.getByText(/strong structure/i)).toBeDefined();
    expect(screen.getAllByRole("link", { name: /view work/i })).toHaveLength(2);
  });

  it("does not render unsafe material or submission URLs as active links", async () => {
    const { ParentAssignmentDetail } = await loadComponent();
    render(
      <ParentAssignmentDetail
        assignment={detail({
          currentSubmission: {
            id: "submission-unsafe",
            submittedAt: "2026-06-19T18:00:00.000Z",
            submittedWorkHref: "javascript:alert(1)",
          },
          submissionHistory: [
            {
              feedback: null,
              grade: null,
              id: "submission-unsafe",
              status: "Submitted",
              submittedAt: "2026-06-19T18:00:00.000Z",
              submittedWorkHref: "javascript:alert(1)",
            },
          ],
        })}
      />,
    );

    expect(screen.queryByRole("link", { name: /unsafe javascript/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe data/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe file/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe http/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /view work/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain('href="javascript:alert(1)"');
    expect(document.body.innerHTML).not.toContain('href="data:text/html,unsafe"');
    expect(document.body.innerHTML).not.toContain('href="file:///C:/secret.pdf"');
    expect(document.body.innerHTML).not.toContain('href="http://cdn.example.com/insecure.pdf"');
  });

  it("renders archived assignments as read-only", async () => {
    const { ParentAssignmentDetail } = await loadComponent();
    render(
      <ParentAssignmentDetail
        assignment={detail({
          archivedAt: "2026-06-21T10:00:00.000Z",
          currentSubmission: null,
          readOnlyReason: "This assignment is archived.",
          status: "Archived",
          submissionHistory: [],
        })}
      />,
    );

    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.getByText(/read-only/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^submit$|resubmit/i })).toBeNull();
  });

  it("is read-only and never exposes submit, resubmit, edit, archive, or grading controls", async () => {
    const { ParentAssignmentDetail } = await loadComponent();
    render(<ParentAssignmentDetail assignment={detail()} />);

    expect(screen.getByText(/parents can view assignment progress/i)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/work link|submission url|feedback|grade/i)).toBeNull();
    expect(
      screen.queryByText(/submit work|resubmit work|archive assignment|save grade/i),
    ).toBeNull();
  });
});
