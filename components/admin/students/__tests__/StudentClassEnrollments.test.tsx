import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkStudentClassActionMock = vi.hoisted(() => vi.fn());
const unlinkStudentClassActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/students/actions", () => ({
  linkStudentClassAction: linkStudentClassActionMock,
  unlinkStudentClassAction: unlinkStudentClassActionMock,
}));

type StudentClassEnrollmentsProps = {
  studentId: string;
  enrolledClasses: Array<{
    id: string;
    title: string;
    startAt: Date;
    teacher: { id: string; fullName: string } | null;
  }>;
  availableClasses: Array<{
    id: string;
    title: string;
    startAt: Date;
    teacher: { id: string; fullName: string } | null;
  }>;
  preferredClassId?: string;
  flashMessage?: string;
  flashError?: string;
};

async function loadStudentClassEnrollments() {
  const specifier = "@/components/admin/students/StudentClassEnrollments";
  return import(/* @vite-ignore */ specifier) as Promise<{
    StudentClassEnrollments: React.ComponentType<StudentClassEnrollmentsProps>;
  }>;
}

describe("StudentClassEnrollments admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders enrolled classes, class metadata, remove controls, and an enrollment control", async () => {
    const { StudentClassEnrollments } = await loadStudentClassEnrollments();

    render(
      <StudentClassEnrollments
        studentId="student-1"
        enrolledClasses={[
          {
            id: "class-1",
            title: "Mathematics 8A",
            startAt: new Date("2026-05-06T09:00:00.000Z"),
            teacher: {
              id: "teacher-1",
              fullName: "Jane Doe",
            },
          },
          {
            id: "class-2",
            title: "Physics 8A",
            startAt: new Date("2026-05-07T11:00:00.000Z"),
            teacher: {
              id: "teacher-2",
              fullName: "John Smith",
            },
          },
        ]}
        availableClasses={[
          {
            id: "class-1",
            title: "Mathematics 8A",
            startAt: new Date("2026-05-06T09:00:00.000Z"),
            teacher: {
              id: "teacher-1",
              fullName: "Jane Doe",
            },
          },
          {
            id: "class-3",
            title: "Chemistry 8A",
            startAt: new Date("2026-05-08T13:30:00.000Z"),
            teacher: {
              id: "teacher-3",
              fullName: "Alice Brown",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/mathematics 8a/i)).toBeDefined();
    expect(screen.getByText(/physics 8a/i)).toBeDefined();
    expect(screen.getByText(/jane doe/i)).toBeDefined();
    expect(screen.getByText(/john smith/i)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /remove/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /enroll class|add class/i })).toBeDefined();
    expect(screen.getByRole("combobox")).toBeDefined();
    expect(screen.getAllByText(/2026|am|pm|\d{1,2}:\d{2}/i).length).toBeGreaterThan(0);

    const optionLabels = screen
      .getAllByRole("option")
      .map((option) => option.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    expect(optionLabels).not.toContain("Mathematics 8A");
    expect(optionLabels).toContain("Chemistry 8A");
  });

  it("shows an empty state when no classes are enrolled", async () => {
    const { StudentClassEnrollments } = await loadStudentClassEnrollments();

    render(
      <StudentClassEnrollments studentId="student-1" enrolledClasses={[]} availableClasses={[]} />,
    );

    expect(screen.getByRole("status").textContent).toMatch(
      /no enrolled classes|no classes linked/i,
    );
    expect(screen.getByRole("button", { name: /enroll class|add class/i })).toBeDefined();
  });

  it("shows visible success and error feedback", async () => {
    const { StudentClassEnrollments } = await loadStudentClassEnrollments();

    render(
      <StudentClassEnrollments
        studentId="student-1"
        enrolledClasses={[]}
        availableClasses={[]}
        flashMessage="Class enrolled."
      />,
    );

    expect(screen.getByText(/class enrolled/i)).toBeDefined();

    cleanup();

    render(
      <StudentClassEnrollments
        studentId="student-1"
        enrolledClasses={[]}
        availableClasses={[]}
        flashError="Class enrollment failed."
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/class enrollment failed/i);
  });

  it("preselects the requested class when opened from a class enrollment link", async () => {
    const { StudentClassEnrollments } = await loadStudentClassEnrollments();

    render(
      <StudentClassEnrollments
        studentId="student-1"
        enrolledClasses={[]}
        availableClasses={[
          {
            id: "class-1",
            title: "Mathematics 8A",
            startAt: new Date("2026-05-06T09:00:00.000Z"),
            teacher: null,
          },
          {
            id: "class-2",
            title: "Physics 8A",
            startAt: new Date("2026-05-07T11:00:00.000Z"),
            teacher: null,
          },
        ]}
        preferredClassId="class-2"
      />,
    );

    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("class-2");
  });
});
