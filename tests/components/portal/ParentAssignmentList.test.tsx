import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

type ParentAssignmentListProps = {
  assignments: Array<Record<string, unknown>>;
  studentId: string;
};

type ParentAssignmentListModule = {
  ParentAssignmentList: ComponentType<ParentAssignmentListProps>;
};

function loadComponent() {
  const specifier = "@/app/portal/parent/assignments/[studentId]/ParentAssignmentList";
  return import(/* @vite-ignore */ specifier) as Promise<ParentAssignmentListModule>;
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    descriptionPreview: "Solve questions 1-10 from the workbook.",
    detailHref: "/portal/parent/assignments/student-1/assignment-1",
    dueDate: "2026-06-20T20:00:00.000Z",
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

describe("ParentAssignmentList", () => {
  afterEach(() => cleanup());

  it("renders linked-child assignments with academic summary fields and parent detail links", async () => {
    const { ParentAssignmentList } = await loadComponent();
    render(
      <ParentAssignmentList
        assignments={[
          assignment({ id: "assignment-active", grade: null, status: "Not submitted" }),
          assignment({ id: "assignment-submitted", grade: null, status: "Submitted" }),
          assignment(),
          assignment({
            dueDate: "2020-01-01T20:00:00.000Z",
            feedbackPreview: null,
            grade: null,
            id: "assignment-missing",
            status: "Missing",
            title: "Missing trigonometry homework",
          }),
          assignment({ id: "assignment-archived", status: "Archived" }),
        ]}
        studentId="student-1"
      />,
    );

    const card = screen.getByRole("article", { name: /quadratic equations/i });
    expect(within(card).getByText(/graded/i)).toBeDefined();
    expect(within(card).getByText(/20|jun|2026/i)).toBeDefined();
    expect(within(card).getByText(/mathematics/i)).toBeDefined();
    expect(within(card).getByText(/algebra lesson/i)).toBeDefined();
    expect(within(card).getByText(/igcse mathematics a/i)).toBeDefined();
    expect(within(card).getByText(/grade:\s*91/i)).toBeDefined();
    expect(within(card).getByText(/clear method/i)).toBeDefined();
    expect(
      within(card).getByRole("link", { name: /view assignment|open assignment|details/i }),
    ).toHaveAttribute("href", "/portal/parent/assignments/student-1/assignment-1");

    for (const status of ["Not submitted", "Submitted", "Graded", "Missing", "Archived"]) {
      expect(screen.getByText(new RegExp(status, "i"))).toBeDefined();
    }
    expect(screen.getByText(/missing trigonometry homework/i)).toBeDefined();
    expect(screen.getByText(/read-only|overdue|missing/i)).toBeDefined();
    expect(screen.queryByText(/^overdue$/i)).toBeNull();
  });

  it("renders parent assignments read-only without student or teacher mutation controls", async () => {
    const { ParentAssignmentList } = await loadComponent();
    render(<ParentAssignmentList assignments={[assignment()]} studentId="student-1" />);

    expect(
      screen.queryByRole("button", { name: /submit|resubmit|edit|archive|save|grade/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/work link|submission url|feedback|grade/i)).toBeNull();
    expect(
      screen.queryByText(/submit homework|resubmit work|archive assignment|save grade/i),
    ).toBeNull();
  });

  it("renders an empty state without leaking foreign assignment labels", async () => {
    const { ParentAssignmentList } = await loadComponent();
    render(<ParentAssignmentList assignments={[]} studentId="student-1" />);

    expect(screen.getByText(/no assignments available|no homework available/i)).toBeDefined();
    expect(screen.queryByText(/foreign assignment/i)).toBeNull();
  });
});
