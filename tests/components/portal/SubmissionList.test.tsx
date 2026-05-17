import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmissionList } from "@/app/portal/teacher/components/SubmissionList";

describe("SubmissionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a list of submissions", () => {
    render(
      <SubmissionList
        submissions={[
          {
            id: "sub-1",
            studentName: "Amina Yusuf",
            assignmentTitle: "Algebra Worksheet",
            submittedAt: "2026-06-01T09:00:00.000Z",
            grade: null,
            feedback: null,
          },
          {
            id: "sub-2",
            studentName: "Daniel Mwangi",
            assignmentTitle: "Algebra Worksheet",
            submittedAt: "2026-06-01T09:10:00.000Z",
            grade: 96,
            feedback: "Excellent",
          },
        ]}
      />,
    );

    expect(screen.getByText(/amina yusuf/i)).toBeDefined();
    expect(screen.getByText(/daniel mwangi/i)).toBeDefined();
    expect(screen.getByText(/algebra worksheet/i)).toBeDefined();
  });

  it("shows distinct graded and ungraded statuses", () => {
    render(
      <SubmissionList
        submissions={[
          {
            id: "sub-1",
            studentName: "Student One",
            assignmentTitle: "Physics Quiz",
            submittedAt: "2026-06-02T09:00:00.000Z",
            grade: null,
            feedback: null,
          },
          {
            id: "sub-2",
            studentName: "Student Two",
            assignmentTitle: "Physics Quiz",
            submittedAt: "2026-06-02T09:10:00.000Z",
            grade: 84,
            feedback: "Needs clearer explanation.",
          },
        ]}
      />,
    );

    expect(screen.getByText(/ungraded/i)).toBeDefined();
    expect(screen.getByText(/graded/i)).toBeDefined();
  });
});
