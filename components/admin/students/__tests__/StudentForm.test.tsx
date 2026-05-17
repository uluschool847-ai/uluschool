import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createStudentActionMock = vi.hoisted(() => vi.fn());
const updateStudentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/students/actions", () => ({
  createStudentAction: createStudentActionMock,
  updateStudentAction: updateStudentActionMock,
}));

type StudentFormProps = {
  mode: "create" | "edit";
  student?: {
    id: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
    isActive?: boolean;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

async function loadStudentForm() {
  const specifier = "@/components/admin/students/StudentForm";
  return import(/* @vite-ignore */ specifier) as Promise<{
    StudentForm: React.ComponentType<StudentFormProps>;
  }>;
}

describe("StudentForm admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create mode fields without exposing role editing", async () => {
    const { StudentForm } = await loadStudentForm();

    render(
      <StudentForm
        mode="create"
        successRedirect="/admin/students"
        errorRedirect="/admin/students/new"
      />,
    );

    expect(screen.getByRole("heading", { name: /create student/i })).toBeDefined();
    expect(screen.getByLabelText(/full name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/phone/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create student/i })).toBeDefined();
    expect(screen.queryByLabelText(/role/i)).toBeNull();
    expect(screen.queryByRole("combobox", { name: /role/i })).toBeNull();
  }, 15_000);

  it("renders edit mode with existing student values", async () => {
    const { StudentForm } = await loadStudentForm();

    render(
      <StudentForm
        mode="edit"
        student={{
          id: "student-1",
          fullName: "Alice Student",
          email: "alice.student@example.com",
          phoneWhatsapp: "+254700000000",
          isActive: true,
        }}
        successRedirect="/admin/students"
        errorRedirect="/admin/students/student-1/edit"
      />,
    );

    expect(screen.getByRole("heading", { name: /edit student/i })).toBeDefined();
    expect(screen.getByDisplayValue("Alice Student")).toBeDefined();
    expect(screen.getByDisplayValue("alice.student@example.com")).toBeDefined();
    expect(screen.getByDisplayValue("+254700000000")).toBeDefined();
    expect(screen.getByRole("button", { name: /save changes|update student/i })).toBeDefined();
    expect(screen.queryByLabelText(/role/i)).toBeNull();
    expect(screen.queryByRole("combobox", { name: /role/i })).toBeNull();
  });

  it("shows flash success and error feedback visibly", async () => {
    const { StudentForm } = await loadStudentForm();

    render(
      <StudentForm
        mode="create"
        flashMessage="Student account created."
        successRedirect="/admin/students"
        errorRedirect="/admin/students/new"
      />,
    );

    expect(screen.getByText(/student account created/i)).toBeDefined();

    cleanup();

    render(
      <StudentForm
        mode="create"
        flashError="Student account failed."
        successRedirect="/admin/students"
        errorRedirect="/admin/students/new"
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/student account failed/i);
  });
});
