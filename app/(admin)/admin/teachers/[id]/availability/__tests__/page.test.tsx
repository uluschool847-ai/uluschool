import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getAdminTeachersMock = vi.hoisted(() => vi.fn());
const getTeacherAvailabilityAdminDataMock = vi.hoisted(() => vi.fn());
const listTeacherAvailabilityRulesMock = vi.hoisted(() => vi.fn());
const listTeacherUnavailablePeriodsMock = vi.hoisted(() => vi.fn());
const findAvailableTeachersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/cms-repository", () => ({
  getAdminTeachers: getAdminTeachersMock,
}));

vi.mock("@/lib/repositories/teacher-availability-repository", () => ({
  findAvailableTeachers: findAvailableTeachersMock,
  getTeacherAvailabilityAdminData: getTeacherAvailabilityAdminDataMock,
  listTeacherAvailabilityRules: listTeacherAvailabilityRulesMock,
  listTeacherUnavailablePeriods: listTeacherUnavailablePeriodsMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type TeacherAvailabilityPageModule = {
  default: (props: {
    params: { id: string } | Promise<{ id: string }>;
    searchParams?: Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

type TeachersAdminPageModule = {
  default: () => Promise<JSX.Element> | JSX.Element;
};

async function loadTeacherAvailabilityPage() {
  const specifier = "@/app/(admin)/admin/teachers/[id]/availability/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherAvailabilityPageModule>;
}

async function loadTeachersAdminPage() {
  const specifier = "@/app/(admin)/admin/teachers/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeachersAdminPageModule>;
}

const teacherAvailabilityData = {
  teacher: {
    id: "teacher-1",
    name: "Jane Teacher",
    email: "jane.teacher@example.com",
    role: UserRole.TEACHER,
  },
  rules: [
    {
      id: "rule-1",
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Europe/Kiev",
      status: "ACTIVE",
    },
  ],
  unavailablePeriods: [
    {
      id: "period-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-10T09:00:00.000Z"),
      endAt: new Date("2026-06-10T12:00:00.000Z"),
      reason: "Exam board meeting",
    },
    {
      id: "period-past",
      teacherId: "teacher-1",
      startAt: new Date("2026-04-10T09:00:00.000Z"),
      endAt: new Date("2026-04-10T12:00:00.000Z"),
      reason: "Past conference",
    },
  ],
  upcomingLessons: [
    {
      id: "lesson-1",
      title: "Algebra lesson",
      startAt: new Date("2026-06-03T09:00:00.000Z"),
      endAt: new Date("2026-06-03T10:00:00.000Z"),
      classGroup: { id: "group-1", name: "IGCSE Mathematics" },
      ownershipPath: "DIRECT_TEACHER",
    },
    {
      id: "lesson-class-group-owned",
      title: "Class group owned geometry",
      startAt: new Date("2026-06-05T09:00:00.000Z"),
      endAt: new Date("2026-06-05T10:00:00.000Z"),
      classGroup: { id: "group-1", name: "IGCSE Mathematics" },
      ownershipPath: "CLASS_GROUP_TEACHER",
    },
  ],
  conflicts: [
    {
      lessonId: "lesson-2",
      title: "Geometry lesson",
      reason: "OUTSIDE_AVAILABILITY",
      startAt: new Date("2026-06-04T16:00:00.000Z"),
      endAt: new Date("2026-06-04T17:00:00.000Z"),
      ownershipPath: "DIRECT_TEACHER",
    },
    {
      lessonId: "lesson-3",
      title: "Period overlap lesson",
      reason: "UNAVAILABLE_PERIOD",
      startAt: new Date("2026-06-10T09:30:00.000Z"),
      endAt: new Date("2026-06-10T10:30:00.000Z"),
      ownershipPath: "CLASS_GROUP_TEACHER",
    },
    {
      lessonId: "lesson-4",
      title: "Double booked lesson",
      reason: "ALREADY_BOOKED",
      startAt: new Date("2026-06-11T09:30:00.000Z"),
      endAt: new Date("2026-06-11T10:30:00.000Z"),
      ownershipPath: "CLASS_GROUP_TEACHER",
    },
  ],
};

describe("Admin teacher availability page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    listTeacherAvailabilityRulesMock.mockResolvedValue(teacherAvailabilityData.rules);
    listTeacherUnavailablePeriodsMock.mockResolvedValue(teacherAvailabilityData.unavailablePeriods);
    findAvailableTeachersMock.mockResolvedValue([{ teacherId: "teacher-1", available: true }]);
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN access and renders teacher identity, rules, unavailable periods, and lessons", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce(teacherAvailabilityData);

    const page = await loadTeacherAvailabilityPage();
    render(await page.default({ params: { id: "teacher-1" } }));

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getTeacherAvailabilityAdminDataMock).toHaveBeenCalledWith("teacher-1");
    expect(screen.getByRole("heading", { name: /teacher availability/i })).toBeDefined();
    expect(screen.getByText(/jane teacher/i)).toBeDefined();
    expect(screen.getByText(/jane\.teacher@example\.com/i)).toBeDefined();
    expect(screen.getByText(/monday|mon/i)).toBeDefined();
    expect(screen.getByText(/09:00/)).toBeDefined();
    expect(screen.getAllByText(/12:00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/europe\/kiev/i)).toBeDefined();
    expect(screen.getByText(/exam board meeting/i)).toBeDefined();
    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getAllByText(/igcse mathematics/i).length).toBeGreaterThan(0);
  });

  it("returns notFound for a non-teacher target account", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce({
      ...teacherAvailabilityData,
      teacher: {
        id: "student-1",
        name: "Student Account",
        email: "student@example.com",
        role: UserRole.STUDENT,
      },
    });

    const page = await loadTeacherAvailabilityPage();
    await page.default({ params: { id: "student-1" } });

    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders empty states for teachers without rules or unavailable periods", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce({
      ...teacherAvailabilityData,
      rules: [],
      unavailablePeriods: [],
      upcomingLessons: [],
      conflicts: [],
    });
    listTeacherAvailabilityRulesMock.mockResolvedValueOnce([]);
    listTeacherUnavailablePeriodsMock.mockResolvedValueOnce([]);

    const page = await loadTeacherAvailabilityPage();
    render(await page.default({ params: { id: "teacher-1" } }));

    expect(screen.getByText(/no availability rules|no weekly availability/i)).toBeDefined();
    expect(screen.getByText(/no unavailable periods|no blocked periods/i)).toBeDefined();
    expect(screen.getByText(/no upcoming lessons|no lessons scheduled/i)).toBeDefined();
    expect(screen.getByText(/no conflicts|no availability conflicts/i)).toBeDefined();
  });

  it("shows a conflicts section with stable reasons for direct and class-group-owned lessons", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce(teacherAvailabilityData);

    const page = await loadTeacherAvailabilityPage();
    render(await page.default({ params: { id: "teacher-1" } }));

    expect(screen.getByRole("heading", { name: /conflicts/i })).toBeDefined();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/conflict|outside availability|not available/i);
    expect(within(alert).getByText(/geometry lesson/i)).toBeDefined();
    expect(within(alert).getByText(/outside weekly availability/i)).toBeDefined();
    expect(within(alert).getByText(/period overlap lesson/i)).toBeDefined();
    expect(within(alert).getByText(/unavailable period/i)).toBeDefined();
    expect(within(alert).getByText(/double booked lesson/i)).toBeDefined();
    expect(within(alert).getByText(/already booked|booking overlap/i)).toBeDefined();
    expect(within(alert).getByText(/class group owned/i)).toBeDefined();
  });

  it("renders teacher timezone dates and admin navigation links", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce(teacherAvailabilityData);

    const page = await loadTeacherAvailabilityPage();
    render(await page.default({ params: { id: "teacher-1" } }));

    expect(screen.getAllByText(/europe\/kiev/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/jun 3, 2026, 12:00 pm/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /back to teacher|teacher profile/i })).toHaveAttribute(
      "href",
      "/admin/teachers/teacher-1",
    );
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(screen.getByRole("link", { name: /algebra lesson|lesson details/i })).toHaveAttribute(
      "href",
      "/admin/classes/group-1/lessons/lesson-1",
    );
  });

  it("exposes admin create, edit, status, and delete controls for weekly rules and periods", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce(teacherAvailabilityData);

    const page = await loadTeacherAvailabilityPage();
    render(await page.default({ params: { id: "teacher-1" } }));

    expect(
      screen.getByRole("button", { name: /create availability rule|add rule/i }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /edit availability rule|edit rule/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /deactivate|activate/i })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /delete availability rule|delete rule/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /create unavailable period|add period/i }),
    ).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: /edit unavailable period|edit period/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /delete unavailable period|delete period/i }).length,
    ).toBeGreaterThan(0);
  });

  it("shows upcoming and past unavailable periods separately for the target teacher", async () => {
    getTeacherAvailabilityAdminDataMock.mockResolvedValueOnce(teacherAvailabilityData);
    listTeacherUnavailablePeriodsMock.mockResolvedValueOnce(
      teacherAvailabilityData.unavailablePeriods,
    );

    const page = await loadTeacherAvailabilityPage();
    render(await page.default({ params: { id: "teacher-1" } }));

    expect(screen.getByRole("heading", { name: /upcoming unavailable periods/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /past unavailable periods/i })).toBeDefined();
    expect(screen.getByText(/exam board meeting/i)).toBeDefined();
    expect(screen.getByText(/past conference/i)).toBeDefined();
    expect(screen.queryByText(/other teacher period/i)).toBeNull();
  });

  it("exposes an availability affordance from the teacher admin area", async () => {
    getAdminTeachersMock.mockResolvedValueOnce([
      {
        id: "teacher-profile-1",
        fullName: "Jane Teacher",
        title: "Mathematics Teacher",
        bio: "Experienced online mathematics teacher.",
        photoUrl: null,
        subjects: [],
        cabinetUserId: "teacher-1",
        displayOrder: 1,
        isActive: true,
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    const page = await loadTeachersAdminPage();
    render(await page.default());

    const janeRow = screen.getByText(/jane teacher/i).closest("tr") ?? document.body;
    expect(
      within(janeRow as HTMLElement).queryByRole("link", { name: /availability/i }) ??
        within(janeRow as HTMLElement).queryByRole("button", { name: /availability/i }),
    ).toBeDefined();
  });
});
