import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createScheduledClassActionMock = vi.hoisted(() => vi.fn());
const updateScheduledClassActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/actions/academic-actions", () => ({
  createScheduledClassAction: createScheduledClassActionMock,
  updateScheduledClassAction: updateScheduledClassActionMock,
}));

type ScheduledClassFormModule = {
  ScheduledClassForm: (props: {
    mode: "create" | "edit";
    teachers: Array<{
      id: string;
      fullName: string;
      email: string;
      role?: string;
      isActive: boolean;
    }>;
    subjects?: Array<{
      id: string;
      name: string;
      slug: string;
      isActive: boolean;
    }>;
    scheduledClass?: {
      id: string;
      title: string;
      description: string | null;
      startAt: Date;
      endAt: Date;
      liveLessonUrl: string;
      subjectId?: string | null;
      subject?: { id: string; name: string; slug: string; isActive?: boolean } | null;
      teacherId: string | null;
      teacher?: { id: string; fullName: string; email: string; isActive: boolean } | null;
    };
    flashMessage?: string;
    flashError?: string;
  }) => JSX.Element;
};

async function loadScheduledClassForm() {
  const specifier = "@/components/admin/classes/ScheduledClassForm";
  return import(/* @vite-ignore */ specifier) as Promise<ScheduledClassFormModule>;
}

describe("ScheduledClassForm admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create fields, teacher selector, validation affordances, and feedback", async () => {
    const { ScheduledClassForm } = await loadScheduledClassForm();

    render(
      <ScheduledClassForm
        mode="create"
        teachers={[
          {
            id: "teacher-1",
            fullName: "John Smith",
            email: "john@example.com",
            role: UserRole.TEACHER,
            isActive: true,
          },
        ]}
        subjects={[
          { id: "subject-math", name: "Mathematics", slug: "mathematics", isActive: true },
          { id: "subject-biology", name: "Biology", slug: "biology", isActive: true },
        ]}
        flashError="Teacher is required"
        flashMessage="Class saved"
      />,
    );

    expect(screen.getByLabelText(/title/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/start/i)).toBeDefined();
    expect(screen.getByLabelText(/end|duration/i)).toBeDefined();
    expect(screen.getByLabelText(/teacher/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /john smith/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^mathematics$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^biology$/i })).toBeDefined();
    expect(screen.getByText(/teacher is required/i)).toBeDefined();
    expect(screen.getByText(/class saved/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create.*class|save.*class/i })).toBeDefined();
  });

  it("renders edit values and keeps the currently assigned inactive teacher selectable", async () => {
    const { ScheduledClassForm } = await loadScheduledClassForm();

    render(
      <ScheduledClassForm
        mode="edit"
        teachers={[
          {
            id: "teacher-active",
            fullName: "Active Teacher",
            email: "active@example.com",
            role: UserRole.TEACHER,
            isActive: true,
          },
        ]}
        subjects={[{ id: "subject-biology", name: "Biology", slug: "biology", isActive: true }]}
        scheduledClass={{
          id: "class-1",
          title: "IGCSE Mathematics - Group A",
          description: "Algebra and functions",
          startAt: new Date("2026-06-01T10:00:00.000Z"),
          endAt: new Date("2026-06-01T11:00:00.000Z"),
          liveLessonUrl: "https://meet.example.com/math-a",
          subjectId: "subject-inactive-math",
          subject: {
            id: "subject-inactive-math",
            name: "Mathematics",
            slug: "mathematics",
            isActive: false,
          },
          teacherId: "teacher-inactive",
          teacher: {
            id: "teacher-inactive",
            fullName: "Inactive Teacher",
            email: "inactive@example.com",
            isActive: false,
          },
        }}
      />,
    );

    expect(screen.getByDisplayValue(/igcse mathematics - group a/i)).toBeDefined();
    expect(screen.getByDisplayValue(/algebra and functions/i)).toBeDefined();
    expect(screen.getByDisplayValue("subject-inactive-math")).toBeDefined();
    expect(screen.getByRole("option", { name: /mathematics.*inactive/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^biology$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /inactive teacher/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^active teacher$/i })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: /student/i })).toBeNull();
  });
});
