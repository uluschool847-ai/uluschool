import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enrollStudentToClassGroupActionMock = vi.hoisted(() => vi.fn());
const unenrollStudentFromClassGroupActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/classes/actions", () => ({
  enrollStudentToClassGroupAction: enrollStudentToClassGroupActionMock,
  unenrollStudentFromClassGroupAction: unenrollStudentFromClassGroupActionMock,
}));

type ClassGroupStudentEnrollmentsModule = {
  ClassGroupStudentEnrollments: (props: {
    classGroupId: string;
    currentStudents: Array<{ id: string; fullName: string; email: string }>;
    availableStudents: Array<{ id: string; fullName: string; email: string }>;
    flashMessage?: string;
    flashError?: string;
  }) => JSX.Element;
};

async function loadClassGroupStudentEnrollments() {
  const specifier = "@/components/admin/classes/ClassGroupStudentEnrollments";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGroupStudentEnrollmentsModule>;
}

describe("ClassGroupStudentEnrollments admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows current students, available students, and add/remove controls", async () => {
    const { ClassGroupStudentEnrollments } = await loadClassGroupStudentEnrollments();

    render(
      <ClassGroupStudentEnrollments
        classGroupId="group-1"
        currentStudents={[
          { id: "student-1", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
          { id: "student-2", fullName: "Mark Shevchenko", email: "mark@example.com" },
        ]}
        availableStudents={[
          { id: "student-3", fullName: "Available Student", email: "available@example.com" },
        ]}
      />,
    );

    expect(screen.getByText(/sofia shevchenko/i)).toBeDefined();
    expect(screen.getByText(/mark shevchenko/i)).toBeDefined();
    expect(screen.getByText(/available student/i)).toBeDefined();
    expect(screen.getByRole("combobox", { name: /student/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /add|enroll|enrol/i })).toBeDefined();
    expect(screen.getAllByRole("button", { name: /remove|unenroll|unenrol/i })).toHaveLength(2);
  });

  it("shows a visible duplicate enrolment prevention error", async () => {
    const { ClassGroupStudentEnrollments } = await loadClassGroupStudentEnrollments();

    render(
      <ClassGroupStudentEnrollments
        classGroupId="group-1"
        currentStudents={[
          { id: "student-1", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
        ]}
        availableStudents={[]}
        flashError="Student is already enrolled in this class group."
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/already enrolled/i);
  });
});
