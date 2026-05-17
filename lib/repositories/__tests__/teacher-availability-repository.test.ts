import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  teacherAvailabilityRule: {
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  teacherUnavailablePeriod: {
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type AvailabilitySlotStatus = "ACTIVE" | "INACTIVE";
type TeacherUnavailableReason =
  | "OUTSIDE_AVAILABILITY"
  | "UNAVAILABLE_PERIOD"
  | "ALREADY_BOOKED"
  | "INVALID_TEACHER";

type AvailabilityRuleInput = {
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone?: string;
  status?: AvailabilitySlotStatus;
};

type UnavailablePeriodInput = {
  teacherId: string;
  startAt: Date;
  endAt: Date;
  reason?: string | null;
};

type AvailabilityCheckInput = {
  teacherId: string;
  startAt: Date;
  endAt: Date;
  excludeLessonId?: string;
};

type TeacherAvailabilityRepositoryModule = {
  listTeacherAvailabilityRules: (teacherId: string) => Promise<AvailabilityRuleRecord[]>;
  createTeacherAvailabilityRule: (input: AvailabilityRuleInput) => Promise<AvailabilityRuleRecord>;
  updateTeacherAvailabilityRule: (
    id: string,
    teacherId: string,
    input: Partial<AvailabilityRuleInput>,
  ) => Promise<AvailabilityRuleRecord>;
  setTeacherAvailabilityRuleStatus: (
    id: string,
    teacherId: string,
    status: AvailabilitySlotStatus,
  ) => Promise<AvailabilityRuleRecord>;
  deleteTeacherAvailabilityRule: (id: string, teacherId: string) => Promise<{ id: string }>;
  listTeacherUnavailablePeriods: (teacherId: string) => Promise<UnavailablePeriodRecord[]>;
  createTeacherUnavailablePeriod: (
    input: UnavailablePeriodInput,
  ) => Promise<UnavailablePeriodRecord>;
  updateTeacherUnavailablePeriod: (
    id: string,
    teacherId: string,
    input: Partial<UnavailablePeriodInput>,
  ) => Promise<UnavailablePeriodRecord>;
  deleteTeacherUnavailablePeriod: (id: string, teacherId: string) => Promise<{ id: string }>;
  checkTeacherAvailability: (
    input: AvailabilityCheckInput,
  ) => Promise<{ available: true } | { available: false; reason: TeacherUnavailableReason }>;
  findAvailableTeachers: (input: {
    startAt: Date;
    endAt: Date;
    teacherIds?: string[];
    excludeLessonId?: string;
  }) => Promise<
    Array<{
      teacherId: string;
      available: boolean;
      reason?: TeacherUnavailableReason;
    }>
  >;
};

type AvailabilityRuleRecord = {
  id: string;
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  status: AvailabilitySlotStatus;
  createdAt: Date;
  updatedAt: Date;
};

type UnavailablePeriodRecord = {
  id: string;
  teacherId: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function loadTeacherAvailabilityRepository() {
  const specifier = "@/lib/repositories/teacher-availability-repository";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherAvailabilityRepositoryModule>;
}

describe("teacher-availability-repository contract", () => {
  const createdAt = new Date("2026-05-01T09:00:00.000Z");
  const updatedAt = new Date("2026-05-10T09:00:00.000Z");
  const lessonStart = new Date("2026-06-01T07:00:00.000Z");
  const lessonEnd = new Date("2026-06-01T08:00:00.000Z");

  function teacher(overrides: Record<string, unknown> = {}) {
    return {
      id: "teacher-1",
      role: UserRole.TEACHER,
      fullName: "Jane Teacher",
      email: "jane.teacher@example.com",
      ...overrides,
    };
  }

  function rule(overrides: Record<string, unknown> = {}): AvailabilityRuleRecord {
    return {
      id: "rule-1",
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Europe/Kiev",
      status: "ACTIVE",
      createdAt,
      updatedAt,
      ...overrides,
    };
  }

  function unavailablePeriod(overrides: Record<string, unknown> = {}): UnavailablePeriodRecord {
    return {
      id: "unavailable-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-01T07:30:00.000Z"),
      endAt: new Date("2026-06-01T08:30:00.000Z"),
      reason: "Medical appointment",
      createdAt,
      updatedAt,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.appUser.findUnique.mockResolvedValue(teacher());
    prismaMock.teacherAvailabilityRule.findMany.mockResolvedValue([rule()]);
    prismaMock.teacherUnavailablePeriod.findMany.mockResolvedValue([]);
    prismaMock.scheduledClass.findFirst.mockResolvedValue(null);
  });

  it("lists teacher availability rules ordered by weekday and start time", async () => {
    prismaMock.teacherAvailabilityRule.findMany.mockResolvedValueOnce([rule()]);

    const { listTeacherAvailabilityRules } = await loadTeacherAvailabilityRepository();
    const result = await listTeacherAvailabilityRules("teacher-1");

    expect(prismaMock.teacherAvailabilityRule.findMany).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1" },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });
    expect(result).toEqual([rule()]);
  });

  it("creates availability rules only for AppUser teachers and validates weekday and time range", async () => {
    prismaMock.teacherAvailabilityRule.create.mockResolvedValueOnce(rule());

    const { createTeacherAvailabilityRule } = await loadTeacherAvailabilityRepository();
    const result = await createTeacherAvailabilityRule({
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Europe/Kiev",
    });

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      select: { id: true, role: true },
    });
    expect(prismaMock.teacherAvailabilityRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherId: "teacher-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
        timezone: "Europe/Kiev",
        status: "ACTIVE",
      }),
    });
    expect(result).toEqual(rule());
  });

  it.each([
    { input: { weekday: 0 }, message: /weekday.*1.*7/i },
    { input: { weekday: 8 }, message: /weekday.*1.*7/i },
    { input: { startTime: "9am" }, message: /time.*HH:mm|time format/i },
    { input: { endTime: "09:00" }, message: /start.*before.*end/i },
  ])("rejects invalid availability rule input %#", async ({ input, message }) => {
    const { createTeacherAvailabilityRule } = await loadTeacherAvailabilityRepository();

    await expect(
      createTeacherAvailabilityRule({
        teacherId: "teacher-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
        ...input,
      }),
    ).rejects.toThrow(message);
    expect(prismaMock.teacherAvailabilityRule.create).not.toHaveBeenCalled();
  });

  it("rejects missing teachers and non-teacher roles", async () => {
    const { createTeacherAvailabilityRule, checkTeacherAvailability } =
      await loadTeacherAvailabilityRepository();

    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    await expect(
      createTeacherAvailabilityRule({
        teacherId: "missing-teacher",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
      }),
    ).rejects.toThrow(/teacher.*not found|invalid teacher/i);

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
    });
    await expect(
      createTeacherAvailabilityRule({
        teacherId: "student-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
      }),
    ).rejects.toThrow(/teacher.*role|invalid teacher/i);

    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    await expect(
      checkTeacherAvailability({
        teacherId: "missing-teacher",
        startAt: lessonStart,
        endAt: lessonEnd,
      }),
    ).resolves.toEqual({ available: false, reason: "INVALID_TEACHER" });
  });

  it("updates, activates/deactivates, and deletes only rules owned by the teacher", async () => {
    prismaMock.teacherAvailabilityRule.findUnique.mockResolvedValue(rule());
    prismaMock.teacherAvailabilityRule.update.mockResolvedValue(rule({ status: "INACTIVE" }));
    prismaMock.teacherAvailabilityRule.delete.mockResolvedValue({ id: "rule-1" });

    const {
      updateTeacherAvailabilityRule,
      setTeacherAvailabilityRuleStatus,
      deleteTeacherAvailabilityRule,
    } = await loadTeacherAvailabilityRepository();

    await updateTeacherAvailabilityRule("rule-1", "teacher-1", { startTime: "10:00" });
    await setTeacherAvailabilityRuleStatus("rule-1", "teacher-1", "INACTIVE");
    await deleteTeacherAvailabilityRule("rule-1", "teacher-1");

    expect(prismaMock.teacherAvailabilityRule.findUnique).toHaveBeenCalledWith({
      where: { id: "rule-1" },
    });
    expect(prismaMock.teacherAvailabilityRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rule-1" },
        data: expect.objectContaining({ status: "INACTIVE" }),
      }),
    );
    expect(prismaMock.teacherAvailabilityRule.delete).toHaveBeenCalledWith({
      where: { id: "rule-1" },
    });
  });

  it("lists and mutates unavailable periods with startAt before endAt validation", async () => {
    prismaMock.teacherUnavailablePeriod.findMany.mockResolvedValueOnce([unavailablePeriod()]);
    prismaMock.teacherUnavailablePeriod.create.mockResolvedValueOnce(unavailablePeriod());
    prismaMock.teacherUnavailablePeriod.findUnique.mockResolvedValue(unavailablePeriod());
    prismaMock.teacherUnavailablePeriod.update.mockResolvedValueOnce(
      unavailablePeriod({ reason: "Conference" }),
    );
    prismaMock.teacherUnavailablePeriod.delete.mockResolvedValueOnce({ id: "unavailable-1" });

    const {
      listTeacherUnavailablePeriods,
      createTeacherUnavailablePeriod,
      updateTeacherUnavailablePeriod,
      deleteTeacherUnavailablePeriod,
    } = await loadTeacherAvailabilityRepository();

    await expect(
      createTeacherUnavailablePeriod({
        teacherId: "teacher-1",
        startAt: lessonStart,
        endAt: lessonStart,
      }),
    ).rejects.toThrow(/start.*before.*end/i);

    expect(await listTeacherUnavailablePeriods("teacher-1")).toEqual([unavailablePeriod()]);
    await createTeacherUnavailablePeriod({
      teacherId: "teacher-1",
      startAt: lessonStart,
      endAt: lessonEnd,
      reason: "Conference",
    });
    await updateTeacherUnavailablePeriod("unavailable-1", "teacher-1", { reason: "Conference" });
    await deleteTeacherUnavailablePeriod("unavailable-1", "teacher-1");

    expect(prismaMock.teacherUnavailablePeriod.findMany).toHaveBeenCalledWith({
      where: { teacherId: "teacher-1" },
      orderBy: [{ startAt: "asc" }],
    });
    expect(prismaMock.teacherUnavailablePeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherId: "teacher-1",
        startAt: lessonStart,
        endAt: lessonEnd,
      }),
    });
    expect(prismaMock.teacherUnavailablePeriod.delete).toHaveBeenCalledWith({
      where: { id: "unavailable-1" },
    });
  });

  it.each([
    {
      label: "no active rule",
      rules: [],
      periods: [],
      booking: null,
      expected: { available: false, reason: "OUTSIDE_AVAILABILITY" },
    },
    {
      label: "inactive rule",
      rules: [rule({ status: "INACTIVE" })],
      periods: [],
      booking: null,
      expected: { available: false, reason: "OUTSIDE_AVAILABILITY" },
    },
    {
      label: "unavailable period",
      rules: [rule()],
      periods: [unavailablePeriod()],
      booking: null,
      expected: { available: false, reason: "UNAVAILABLE_PERIOD" },
    },
    {
      label: "overlapping lesson",
      rules: [rule()],
      periods: [],
      booking: { id: "lesson-2" },
      expected: { available: false, reason: "ALREADY_BOOKED" },
    },
    {
      label: "available",
      rules: [rule()],
      periods: [],
      booking: null,
      expected: { available: true },
    },
  ])("checks teacher availability for $label", async ({ rules, periods, booking, expected }) => {
    prismaMock.teacherAvailabilityRule.findMany.mockResolvedValueOnce(rules);
    prismaMock.teacherUnavailablePeriod.findMany.mockResolvedValueOnce(periods);
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(booking);

    const { checkTeacherAvailability } = await loadTeacherAvailabilityRepository();

    await expect(
      checkTeacherAvailability({ teacherId: "teacher-1", startAt: lessonStart, endAt: lessonEnd }),
    ).resolves.toEqual(expected);
  });

  it("uses excludeLessonId so editing the current lesson does not block itself", async () => {
    const { checkTeacherAvailability } = await loadTeacherAvailabilityRepository();

    await checkTeacherAvailability({
      teacherId: "teacher-1",
      startAt: lessonStart,
      endAt: lessonEnd,
      excludeLessonId: "lesson-1",
    });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: "teacher-1",
          id: { not: "lesson-1" },
        }),
      }),
    );
  });

  it("checks overlapping lessons through direct teacher and class group teacher ownership", async () => {
    const { checkTeacherAvailability } = await loadTeacherAvailabilityRepository();

    await checkTeacherAvailability({
      teacherId: "teacher-1",
      startAt: lessonStart,
      endAt: lessonEnd,
    });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
          startAt: { lt: lessonEnd },
          endAt: { gt: lessonStart },
        }),
      }),
    );
  });

  it("does not let cancelled or completed existing lessons block new scheduling", async () => {
    const { checkTeacherAvailability } = await loadTeacherAvailabilityRepository();

    await checkTeacherAvailability({
      teacherId: "teacher-1",
      startAt: lessonStart,
      endAt: lessonEnd,
      excludeLessonId: "lesson-1",
    });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "lesson-1" },
          status: { notIn: ["CANCELLED", "COMPLETED"] },
        }),
      }),
    );
  });

  it("uses strict overlap boundaries so adjacent lessons are allowed", async () => {
    const { checkTeacherAvailability } = await loadTeacherAvailabilityRepository();

    await expect(
      checkTeacherAvailability({
        teacherId: "teacher-1",
        startAt: lessonStart,
        endAt: lessonEnd,
      }),
    ).resolves.toEqual({ available: true });

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { lt: lessonEnd },
          endAt: { gt: lessonStart },
        }),
      }),
    );
  });

  it("findAvailableTeachers returns available teachers and unavailable reasons without mutating data", async () => {
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      teacher({ id: "teacher-1" }),
      teacher({ id: "teacher-2" }),
    ]);
    prismaMock.teacherAvailabilityRule.findMany
      .mockResolvedValueOnce([rule({ teacherId: "teacher-1" })])
      .mockResolvedValueOnce([]);
    prismaMock.teacherUnavailablePeriod.findMany.mockResolvedValue([]);
    prismaMock.scheduledClass.findFirst.mockResolvedValue(null);

    const { findAvailableTeachers } = await loadTeacherAvailabilityRepository();
    const result = await findAvailableTeachers({ startAt: lessonStart, endAt: lessonEnd });

    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith({
      where: { role: UserRole.TEACHER, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: [{ fullName: "asc" }, { email: "asc" }],
    });
    expect(result).toEqual([
      { teacherId: "teacher-1", available: true },
      { teacherId: "teacher-2", available: false, reason: "OUTSIDE_AVAILABILITY" },
    ]);
    expect(prismaMock.teacherAvailabilityRule.create).not.toHaveBeenCalled();
    expect(prismaMock.teacherUnavailablePeriod.create).not.toHaveBeenCalled();
    expect(prismaMock.scheduledClass.create).toBeUndefined();
  });
});
