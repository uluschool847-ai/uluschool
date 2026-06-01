import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTeacherActionMock = vi.hoisted(() => vi.fn());
const updateTeacherActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/teachers/actions", () => ({
  createTeacherAction: createTeacherActionMock,
  updateTeacherAction: updateTeacherActionMock,
}));

import { TeacherForm } from "@/components/admin/teachers/TeacherForm";

const subjectOptions = [
  { id: "subject-1", slug: "mathematics", name: "Mathematics" },
  { id: "subject-2", slug: "physics", name: "Physics" },
];

type TeacherFormSubjectOption = {
  id: string;
  slug: string;
  name: string;
};

type TeacherFormRecord = {
  id: string;
  fullName: string;
  title: string;
  bio: string;
  photoUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  cabinetUserId: string | null;
  subjects: TeacherFormSubjectOption[];
  updatedAt: Date;
};

function findSubjectsControl() {
  return (
    screen.queryByRole("group", { name: /subjects/i }) ??
    screen.queryByLabelText(/subjects/i) ??
    null
  );
}

function findCabinetControl() {
  return (
    screen.queryByRole("group", { name: /cabinet access/i }) ??
    screen.queryByLabelText(/cabinet access|cabinet user|linked account/i) ??
    null
  );
}

describe("TeacherForm admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create form controls for subjects and cabinet access", () => {
    render(
      <TeacherForm
        subjects={subjectOptions as TeacherFormSubjectOption[]}
        mode="create"
        successRedirect="/admin/teachers"
        errorRedirect="/admin/teachers/new"
      />,
    );

    expect(screen.getByRole("heading", { name: /create teacher profile/i })).toBeDefined();
    expect(screen.getByLabelText(/full name/i)).toBeDefined();
    expect(screen.getByLabelText(/title/i)).toBeDefined();
    expect(screen.getByLabelText(/bio/i)).toBeDefined();
    expect(screen.getByLabelText(/display order/i)).toBeDefined();
    expect(screen.getByLabelText(/active profile/i)).toBeDefined();
    expect(screen.getByLabelText(/photo/i)).toBeDefined();
    expect(findSubjectsControl()).toBeTruthy();
    expect(findCabinetControl()).toBeTruthy();
    expect(screen.getByRole("button", { name: /create teacher/i })).toBeDefined();
  });

  it("renders edit form controls and the current photo preview", () => {
    render(
      <TeacherForm
        subjects={subjectOptions}
        mode="edit"
        teacher={
          {
            id: "teacher-1",
            fullName: "Jane Doe",
            title: "STEM Specialist",
            bio: "Cambridge mathematics specialist with a complete public profile.",
            photoUrl: "/uploads/jane.webp",
            displayOrder: 1,
            isActive: true,
            cabinetUserId: "teacher-123",
            subjects: subjectOptions,
            updatedAt: new Date("2026-05-05T10:00:00.000Z"),
          } as TeacherFormRecord
        }
        successRedirect="/admin/teachers"
        errorRedirect="/admin/teachers/teacher-1/edit"
      />,
    );

    expect(screen.getByRole("heading", { name: /edit teacher profile/i })).toBeDefined();
    expect(screen.getByRole("img", { name: /jane doe/i })).toBeDefined();
    expect(screen.getByLabelText(/remove current photo/i)).toBeDefined();
    expect(findSubjectsControl()).toBeTruthy();
    expect(findCabinetControl()).toBeTruthy();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDefined();
  });

  it("confirms current photo removal with the teacher name before saving", () => {
    render(
      <TeacherForm
        subjects={subjectOptions}
        mode="edit"
        teacher={
          {
            id: "teacher-1",
            fullName: "Jane Doe",
            title: "STEM Specialist",
            bio: "Cambridge mathematics specialist with a complete public profile.",
            photoUrl: "/uploads/jane.webp",
            displayOrder: 1,
            isActive: true,
            cabinetUserId: "teacher-123",
            subjects: subjectOptions,
            updatedAt: new Date("2026-05-05T10:00:00.000Z"),
          } as TeacherFormRecord
        }
        successRedirect="/admin/teachers"
        errorRedirect="/admin/teachers/teacher-1/edit"
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /remove current photo/i }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    const dialog = screen.getByRole("dialog", { name: /remove teacher photo/i });
    expect(within(dialog).getByText(/jane doe/i)).toBeDefined();
  });

  it("shows flash success and error feedback visibly", () => {
    render(
      <TeacherForm
        mode="create"
        flashMessage="Teacher profile created."
        successRedirect="/admin/teachers"
        errorRedirect="/admin/teachers/new"
      />,
    );

    expect(screen.getByText(/teacher profile created/i)).toBeDefined();

    cleanup();

    render(
      <TeacherForm
        mode="create"
        flashError="Teacher profile failed."
        successRedirect="/admin/teachers"
        errorRedirect="/admin/teachers/new"
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/teacher profile failed/i);
  });
});
