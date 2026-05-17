import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClassGroupActionMock = vi.hoisted(() => vi.fn());
const updateClassGroupActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/classes/actions", () => ({
  createClassGroupAction: createClassGroupActionMock,
  updateClassGroupAction: updateClassGroupActionMock,
}));

type ClassGroupFormModule = {
  ClassGroupForm: (props: {
    mode: "create" | "edit";
    teachers: Array<{
      id: string;
      fullName: string;
      email: string;
      role?: UserRole;
      isActive: boolean;
    }>;
    subjects: Array<{
      id: string;
      name: string;
      slug: string;
      isActive?: boolean;
    }>;
    levels: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
    classGroup?: {
      id: string;
      name: string;
      description: string | null;
      subjectId: string | null;
      subject?: { id: string; name: string; slug: string; isActive?: boolean } | null;
      levelId: string | null;
      level?: { id: string; name: string; slug: string } | null;
      teacherId: string | null;
      teacher?: { id: string; fullName: string; email: string; isActive: boolean } | null;
      status: "ACTIVE" | "PAUSED" | "ARCHIVED";
      capacity: number | null;
      startDate: Date | null;
      endDate: Date | null;
    };
    flashMessage?: string;
    flashError?: string;
  }) => JSX.Element;
};

async function loadClassGroupForm() {
  const specifier = "@/components/admin/classes/ClassGroupForm";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGroupFormModule>;
}

describe("ClassGroupForm admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create mode fields for the full class group contract", async () => {
    const { ClassGroupForm } = await loadClassGroupForm();

    render(
      <ClassGroupForm
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
        levels={[
          { id: "level-igcse", name: "IGCSE", slug: "igcse" },
          { id: "level-a-level", name: "A Level", slug: "a-level" },
        ]}
        flashError="Name is required"
        flashMessage="Class group saved"
      />,
    );

    expect(screen.getByLabelText(/^name$/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/level/i)).toBeDefined();
    expect(screen.getByLabelText(/teacher/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/capacity/i)).toBeDefined();
    expect(screen.getByLabelText(/start date/i)).toBeDefined();
    expect(screen.getByLabelText(/end date/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /john smith/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^mathematics$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^igcse$/i })).toBeDefined();
    expect(screen.getByText(/name is required/i)).toBeDefined();
    expect(screen.getByText(/class group saved/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /create.*class group|save.*class group/i }),
    ).toBeDefined();
  });

  it("renders edit values and keeps the currently assigned inactive teacher visible", async () => {
    const { ClassGroupForm } = await loadClassGroupForm();

    render(
      <ClassGroupForm
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
        levels={[{ id: "level-igcse", name: "IGCSE", slug: "igcse" }]}
        classGroup={{
          id: "group-1",
          name: "IGCSE Mathematics Group A",
          description: "Core IGCSE mathematics group",
          subjectId: "subject-math",
          subject: {
            id: "subject-math",
            name: "Mathematics",
            slug: "mathematics",
            isActive: false,
          },
          levelId: "level-igcse",
          level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
          teacherId: "teacher-inactive",
          teacher: {
            id: "teacher-inactive",
            fullName: "Inactive Teacher",
            email: "inactive@example.com",
            isActive: false,
          },
          status: "PAUSED",
          capacity: 8,
          startDate: new Date("2026-06-01T00:00:00.000Z"),
          endDate: new Date("2026-12-15T00:00:00.000Z"),
        }}
      />,
    );

    expect(screen.getByDisplayValue(/igcse mathematics group a/i)).toBeDefined();
    expect(screen.getByDisplayValue(/core igcse mathematics group/i)).toBeDefined();
    expect(screen.getByDisplayValue("subject-math")).toBeDefined();
    expect(screen.getByDisplayValue("level-igcse")).toBeDefined();
    expect(screen.getByDisplayValue("teacher-inactive")).toBeDefined();
    expect(screen.getByDisplayValue("PAUSED")).toBeDefined();
    expect(screen.getByDisplayValue("8")).toBeDefined();
    expect(screen.getByRole("option", { name: /mathematics.*inactive/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /inactive teacher/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^active teacher$/i })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: /student/i })).toBeNull();
  });
});
