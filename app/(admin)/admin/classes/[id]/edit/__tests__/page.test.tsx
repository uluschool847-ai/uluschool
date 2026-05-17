import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listUsersByRoleMock = vi.hoisted(() => vi.fn());
const getClassGroupByIdMock = vi.hoisted(() => vi.fn());
const listActiveSubjectsMock = vi.hoisted(() => vi.fn());
const getLevelsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  listUsersByRole: listUsersByRoleMock,
}));

vi.mock("@/lib/repositories/class-group-repository", () => ({
  getClassGroupById: getClassGroupByIdMock,
}));

vi.mock("@/lib/repositories/subject-repository", () => ({
  listActiveSubjects: listActiveSubjectsMock,
}));

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getLevels: getLevelsMock,
}));

type EditClassGroupPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadEditClassGroupPage() {
  const specifier = "@/app/(admin)/admin/classes/[id]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<EditClassGroupPageModule>;
}

describe("Admin class group edit page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    listUsersByRoleMock.mockResolvedValue([
      {
        id: "teacher-active",
        fullName: "Active Teacher",
        email: "active@example.com",
        isActive: true,
      },
    ]);
    listActiveSubjectsMock.mockResolvedValue([
      { id: "subject-biology", name: "Biology", slug: "biology", isActive: true },
    ]);
    getLevelsMock.mockResolvedValue([
      { id: "level-igcse", name: "IGCSE", slug: "igcse" },
      { id: "level-a-level", name: "A Level", slug: "a-level" },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads a class group and pre-fills the group form", async () => {
    getClassGroupByIdMock.mockResolvedValueOnce({
      id: "group-1",
      name: "IGCSE Mathematics Group A",
      description: "Core IGCSE mathematics group",
      subjectId: "subject-math",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics", isActive: false },
      levelId: "level-igcse",
      level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
      teacherId: "teacher-inactive",
      teacher: {
        id: "teacher-inactive",
        fullName: "Inactive Teacher",
        email: "inactive.teacher@example.com",
        isActive: false,
      },
      status: "PAUSED",
      capacity: 8,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-12-15T00:00:00.000Z"),
      studentsCount: 4,
      upcomingLessonsCount: 2,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-03T10:00:00.000Z"),
    });

    const page = await loadEditClassGroupPage();
    const element = await page.default({ params: { id: "group-1" } });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getClassGroupByIdMock).toHaveBeenCalledWith("group-1");
    expect(listUsersByRoleMock).toHaveBeenCalledWith(UserRole.TEACHER);
    expect(listActiveSubjectsMock).toHaveBeenCalled();
    expect(getLevelsMock).toHaveBeenCalled();
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
  });
});
