import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssignmentDetailView } from "@/app/portal/student/components/AssignmentDetailView";

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "assign-1",
    title: "IGCSE Chemistry Homework",
    description: "Complete balancing equations worksheet.",
    dueDate: "2026-08-10T09:00:00.000Z",
    archivedAt: null,
    subject: { id: "subject-science", name: "Science" },
    scheduledClass: { id: "lesson-1", title: "Stoichiometry lesson" },
    classGroup: { id: "group-1", name: "IGCSE Chemistry Group A" },
    teacher: { id: "teacher-1", fullName: "Dr Ada Teacher" },
    materials: [
      {
        id: "material-https",
        title: "Worksheet",
        href: "https://cdn.example.com/worksheet.pdf",
      },
      {
        id: "material-upload",
        title: "Uploaded notes",
        href: "/uploads/materials/notes.pdf",
      },
      {
        id: "material-js",
        title: "Unsafe JavaScript",
        href: "javascript:alert(1)",
      },
      {
        id: "material-data",
        title: "Unsafe Data",
        href: "data:text/html,unsafe",
      },
      {
        id: "material-file",
        title: "Unsafe File",
        href: "file:///C:/secret.pdf",
      },
      {
        id: "material-http",
        title: "Unsafe HTTP",
        href: "http://cdn.example.com/insecure.pdf",
      },
    ],
    currentSubmission: {
      id: "sub-1",
      contentUrl: "https://drive.example.com/work",
      submittedWorkHref: "https://drive.example.com/work",
      submittedAt: "2026-08-09T10:00:00.000Z",
      grade: 88,
      feedback: "Strong structure. Improve final explanation.",
    },
    submissionHistory: [],
    grade: 88,
    feedback: "Strong structure. Improve final explanation.",
    canSubmit: true,
    canResubmit: true,
    status: "Graded",
    ...overrides,
  };
}

describe("AssignmentDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders assignment title, description, and due date", () => {
    render(<AssignmentDetailView assignment={detail()} />);

    expect(screen.getByText(/igcse chemistry homework/i)).toBeDefined();
    expect(screen.getByText(/complete balancing equations worksheet/i)).toBeDefined();
    expect(screen.getByText(/due|10|aug|2026/i)).toBeDefined();
  });

  it("renders subject, class/group, teacher, materials, grade, and feedback", () => {
    render(<AssignmentDetailView assignment={detail() as never} />);

    expect(screen.getByRole("heading", { name: "IGCSE Chemistry Homework" })).toBeDefined();
    expect(screen.getByText("Science")).toBeDefined();
    expect(screen.getByText(/stoichiometry lesson/i)).toBeDefined();
    expect(screen.getByText("IGCSE Chemistry Group A")).toBeDefined();
    expect(screen.getByText(/dr ada teacher/i)).toBeDefined();
    expect(screen.getByRole("link", { name: "Worksheet" })).toBeDefined();
    expect(screen.getByText(/uploaded notes/i)).toBeDefined();
    expect(screen.getByText(/88/)).toBeDefined();
    expect(screen.getByText(/strong structure\. improve final explanation\./i)).toBeDefined();
  });

  it("renders active links only for https and /uploads material or submission URLs", () => {
    render(<AssignmentDetailView assignment={detail() as never} />);

    expect(screen.getByRole("link", { name: /worksheet/i })).toHaveAttribute(
      "href",
      "https://cdn.example.com/worksheet.pdf",
    );
    expect(screen.getByRole("link", { name: /uploaded notes/i })).toHaveAttribute(
      "href",
      "/uploads/materials/notes.pdf",
    );
    expect(screen.getByRole("link", { name: /submitted work|view work/i })).toHaveAttribute(
      "href",
      "https://drive.example.com/work",
    );
    expect(screen.queryByRole("link", { name: /unsafe javascript/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe data/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe file/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe http/i })).toBeNull();
  });

  it("does not render unsafe submitted work URLs as active links", () => {
    render(
      <AssignmentDetailView
        assignment={
          detail({
            currentSubmission: {
              id: "sub-unsafe",
              contentUrl: "javascript:alert(1)",
              submittedWorkHref: null,
              submittedAt: "2026-08-09T10:00:00.000Z",
              grade: null,
              feedback: null,
            },
          }) as never
        }
      />,
    );

    expect(screen.queryByRole("link", { name: /submitted work|view work/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain('href="javascript:alert(1)"');
  });

  it("renders archived assignments as read-only and not submittable", () => {
    render(
      <AssignmentDetailView
        assignment={
          detail({
            archivedAt: "2026-08-11T10:00:00.000Z",
            canSubmit: false,
            canResubmit: false,
            readOnlyReason: "This assignment is archived.",
          }) as never
        }
      />,
    );

    expect(screen.getByText(/archived/i)).toBeDefined();
    expect(screen.getByText(/read-only|cannot submit|no longer accepting/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^submit$|resubmit/i })).toBeNull();
  });

  it("renders an overdue reminder for Missing assignments", () => {
    render(
      <AssignmentDetailView
        assignment={
          detail({
            currentSubmission: null,
            dueDate: "2020-01-01T10:00:00.000Z",
            feedback: null,
            grade: null,
            status: "Missing",
            submissionHistory: [],
            canResubmit: false,
          }) as never
        }
      />,
    );

    const reminder = screen.getByText(
      /reminder:\s*this assignment is overdue\. submit it as soon as possible\./i,
    );

    expect(reminder).toBeDefined();
  });

  it("does not render an overdue reminder for submitted, graded, or archived assignments", () => {
    const { rerender } = render(<AssignmentDetailView assignment={detail() as never} />);

    expect(screen.queryByText(/this assignment is overdue/i)).toBeNull();

    rerender(
      <AssignmentDetailView
        assignment={
          detail({
            archivedAt: "2026-08-11T10:00:00.000Z",
            canSubmit: false,
            canResubmit: false,
            readOnlyReason: "This assignment is archived.",
            status: "Archived",
          }) as never
        }
      />,
    );

    expect(screen.queryByText(/this assignment is overdue/i)).toBeNull();
  });
});
