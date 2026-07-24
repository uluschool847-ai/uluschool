import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmissionList } from "@/app/portal/teacher/components/SubmissionList";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const SubmissionListContract = SubmissionList as unknown as ComponentType<Record<string, unknown>>;

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    assignmentTitle: "Algebra Worksheet",
    classGroup: { id: "group-1", name: "Algebra Group A" },
    contentUrl: "https://uploads.example/submissions/algebra.pdf",
    feedbackPreview: "Clear working shown.",
    grade: null,
    reviewHref: "/portal/teacher/submissions/sub-1",
    status: "Pending",
    student: {
      email: "amina@example.com",
      fullName: "Amina Yusuf",
      id: "student-1",
    },
    studentEmail: "amina@example.com",
    studentName: "Amina Yusuf",
    subject: { id: "subject-1", name: "Algebra" },
    submittedAt: "2026-06-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("SubmissionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a list of submissions", () => {
    render(
      <SubmissionListContract
        submissions={[
          submission(),
          submission({
            id: "sub-2",
            status: "Graded",
            student: {
              email: "daniel@example.com",
              fullName: "Daniel Mwangi",
              id: "student-2",
            },
            studentEmail: "daniel@example.com",
            studentName: "Daniel Mwangi",
            submittedAt: "2026-06-01T09:10:00.000Z",
            grade: 96,
            feedback: "Excellent",
            feedbackPreview: "Excellent",
          }),
        ]}
      />,
    );

    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/daniel mwangi/i)).toBeDefined();
    expect(screen.getByText(/algebra worksheet/i)).toBeDefined();
  });

  it("shows distinct pending and graded statuses with grade action labels", () => {
    render(
      <SubmissionListContract
        submissions={[
          submission({
            studentName: "Student One",
            student: { id: "student-1", fullName: "Student One", email: "one@example.com" },
            assignmentTitle: "Physics Quiz",
            submittedAt: "2026-06-02T09:00:00.000Z",
            grade: null,
            feedback: null,
            feedbackPreview: null,
            status: "Pending",
          }),
          submission({
            id: "sub-2",
            studentName: "Student Two",
            student: { id: "student-2", fullName: "Student Two", email: "two@example.com" },
            assignmentTitle: "Physics Quiz",
            submittedAt: "2026-06-02T09:10:00.000Z",
            grade: 84,
            feedback: "Needs clearer explanation.",
            feedbackPreview: "Needs clearer explanation.",
            status: "Graded",
          }),
        ]}
      />,
    );

    expect(screen.getByText(/pending/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^grade$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^update grade$/i })).toBeDefined();
  });

  it("renders submission metadata, safe content links, review state, and filter summary", () => {
    render(
      <SubmissionListContract
        filterSummary="Status: Pending; Class: Algebra Group A; Sort: Student name"
        submissions={[submission()]}
      />,
    );

    expect(screen.getByText(/amina@example\.com/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/^algebra$/i)).toBeDefined();
    expect(screen.getByText(/clear working shown/i)).toBeDefined();
    expect(screen.getByText(/status:\s*pending/i)).toBeDefined();
    expect(screen.getByText(/status:\s*pending; class:\s*algebra group a/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view submission/i })).toHaveAttribute(
      "href",
      "https://uploads.example/submissions/algebra.pdf",
    );
    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute(
      "href",
      "/portal/teacher/submissions/sub-1",
    );
  });

  it("shows a bounded feedback preview without replacing the full detail feedback contract", () => {
    const longFeedback = `${"Detailed feedback ".repeat(12)}tail marker only for detail page`;

    render(
      <SubmissionListContract
        submissions={[
          submission({
            feedback: longFeedback,
            feedbackPreview: undefined,
            grade: 88,
            status: "Graded",
          }),
        ]}
      />,
    );

    const preview = screen.getByText(/^Feedback:/i).textContent ?? "";
    expect(preview).toMatch(/\.\.\.$/);
    expect(preview).not.toContain("tail marker only for detail page");
    expect(preview.length).toBeLessThan(longFeedback.length);
  });

  it("uses a clean empty state for pending submissions without feedback", () => {
    render(
      <SubmissionListContract
        submissions={[
          submission({
            feedback: null,
            feedbackPreview: null,
            grade: null,
            status: "Pending",
          }),
        ]}
      />,
    );

    expect(screen.queryByText(/^Feedback:/i)).toBeNull();
    expect(screen.getByText(/no score/i)).toBeDefined();
  });

  it("renders an empty state", () => {
    render(<SubmissionListContract submissions={[]} />);

    expect(screen.getByText(/no submissions found/i)).toBeDefined();
  });

  it("does not render unsafe content URLs as active links", () => {
    render(
      <SubmissionListContract
        submissions={[
          submission({
            contentUrl: "javascript:alert(1)",
            reviewHref: null,
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: /view submission/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /javascript/i })).toBeNull();
    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute(
      "href",
      "/portal/teacher/submissions/sub-1",
    );
  });

  it("renders a canonical private submission URL", () => {
    const href = storageUrlForKey("private/students/student-1/submissions/work.pdf");
    render(<SubmissionListContract submissions={[submission({ contentUrl: href })]} />);

    expect(screen.getByRole("link", { name: /view submission/i })).toHaveAttribute("href", href);
  });

  it("links every row to the submission review workspace instead of a disabled review state", () => {
    render(
      <SubmissionListContract
        submissions={[
          submission({
            id: "sub-derived",
            reviewHref: null,
          }),
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute(
      "href",
      "/portal/teacher/submissions/sub-derived",
    );
    expect(screen.queryByRole("button", { name: /review unavailable/i })).toBeNull();
  });
});
