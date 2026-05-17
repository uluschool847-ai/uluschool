import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateStudentLearningStatusActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/students/actions", () => ({
  updateStudentLearningStatusAction: updateStudentLearningStatusActionMock,
}));

type StudentLearningStatus = "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";

type StudentStatusControlProps = {
  studentId: string;
  currentStatus: StudentLearningStatus;
  accountIsActive: boolean;
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

async function loadStudentStatusControl() {
  const specifier = "@/components/admin/students/StudentStatusControl";
  return import(/* @vite-ignore */ specifier) as Promise<{
    StudentStatusControl: React.ComponentType<StudentStatusControlProps>;
  }>;
}

describe("StudentStatusControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all learning lifecycle statuses separately from account access", async () => {
    const { StudentStatusControl } = await loadStudentStatusControl();

    render(
      <StudentStatusControl
        studentId="student-1"
        currentStatus="PAUSED"
        accountIsActive={true}
        successRedirect="/admin/students/student-1/edit"
        errorRedirect="/admin/students/student-1/edit"
      />,
    );

    expect(screen.getByLabelText(/learning status|lifecycle status/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /trial/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^active$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /paused/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^inactive$/i })).toBeDefined();
    expect(screen.getByDisplayValue("PAUSED")).toBeDefined();
    expect(screen.getByText(/account access/i).textContent).toMatch(/active|enabled/i);
    expect(screen.queryByLabelText(/role/i)).toBeNull();
  });

  it("shows visible success and error feedback", async () => {
    const { StudentStatusControl } = await loadStudentStatusControl();

    render(
      <StudentStatusControl
        studentId="student-1"
        currentStatus="TRIAL"
        accountIsActive={true}
        flashMessage="Student learning status updated."
        successRedirect="/admin/students/student-1/edit"
        errorRedirect="/admin/students/student-1/edit"
      />,
    );

    expect(screen.getByText(/student learning status updated/i)).toBeDefined();

    cleanup();

    render(
      <StudentStatusControl
        studentId="student-1"
        currentStatus="TRIAL"
        accountIsActive={true}
        flashError="Invalid learning status."
        successRedirect="/admin/students/student-1/edit"
        errorRedirect="/admin/students/student-1/edit"
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/invalid learning status/i);
  });
});
