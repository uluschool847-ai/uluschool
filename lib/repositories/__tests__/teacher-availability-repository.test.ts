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
    findFirst: vi.fn(),
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
  getTeacherAvailabilityAdminData: (teacherId: string) => Promise<{
    teacher: { id: string; name: string; role: UserRole };
    rules: AvailabilityRuleRecord[];
    unavailablePeriods: UnavailablePeriodRecord[];
    upcomingLessons: Array<{
      id: string;
      title: string;
      startAt: Date;
      endAt: Date;
      teacherId: string | null;
      classGroup: { id: string; name: string } | null;
    }>;
    conflicts: Array<{
      lessonId: string;
      title: string;
      reason: TeacherUnavailableReason;
      ownershipPath: "DIRECT_TEACHER" | "CLASS_GROUP_TEACHER";
    }>;
  } | null>;
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
      timezone: "Africa/Nairobi",
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
    prismaMock.teacherUnavailablePeriod.findFirst.mockResolvedValue(null);
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
      timezone: "Africa/Nairobi",
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
        timezone: "Africa/Nairobi",
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
    prismaMock.teacherUnavailablePeriod.findFirst.mockResolvedValue(unavailablePeriod());
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

  it("creates unavailable periods only for existing AppUser teachers", async () => {
    const { createTeacherUnavailablePeriod } = await loadTeacherAvailabilityRepository();

    prismaMock.appUser.findUnique.mockResolvedValueOnce(null);
    await expect(
      createTeacherUnavailablePeriod({
        teacherId: "missing-teacher",
        startAt: lessonStart,
        endAt: lessonEnd,
        reason: "Conference",
      }),
    ).rejects.toThrow(/teacher.*not found|invalid teacher/i);

    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
    });
    await expect(
      createTeacherUnavailablePeriod({
        teacherId: "student-1",
        startAt: lessonStart,
        endAt: lessonEnd,
        reason: "Conference",
      }),
    ).rejects.toThrow(/teacher.*role|invalid teacher/i);

    expect(prismaMock.teacherUnavailablePeriod.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "invalid start date",
      input: { startAt: new Date("not-a-date"), endAt: lessonEnd },
      message: /start.*valid/i,
    },
    {
      label: "invalid end date",
      input: { startAt: lessonStart, endAt: new Date("not-a-date") },
      message: /end.*valid/i,
    },
    {
      label: "start equals end",
      input: { startAt: lessonStart, endAt: lessonStart },
      message: /start.*before.*end/i,
    },
    {
      label: "start after end",
      input: { startAt: lessonEnd, endAt: lessonStart },
      message: /start.*before.*end/i,
    },
  ])("validates unavailable period date values for $label", async ({ input, message }) => {
    const { createTeacherUnavailablePeriod, updateTeacherUnavailablePeriod } =
      await loadTeacherAvailabilityRepository();

    await expect(
      createTeacherUnavailablePeriod({
        teacherId: "teacher-1",
        startAt: input.startAt,
        endAt: input.endAt,
        reason: "Conference",
      }),
    ).rejects.toThrow(message);

    prismaMock.teacherUnavailablePeriod.findFirst.mockResolvedValueOnce(unavailablePeriod());
    await expect(
      updateTeacherUnavailablePeriod("unavailable-1", "teacher-1", input),
    ).rejects.toThrow(message);
    expect(prismaMock.teacherUnavailablePeriod.create).not.toHaveBeenCalled();
    expect(prismaMock.teacherUnavailablePeriod.update).not.toHaveBeenCalled();
  });

  it("requires unavailable-period update and delete lookups to include both id and teacherId", async () => {
    prismaMock.teacherUnavailablePeriod.findFirst.mockResolvedValue(unavailablePeriod());
    prismaMock.teacherUnavailablePeriod.update.mockResolvedValueOnce(unavailablePeriod());
    prismaMock.teacherUnavailablePeriod.delete.mockResolvedValueOnce({ id: "unavailable-1" });

    const { updateTeacherUnavailablePeriod, deleteTeacherUnavailablePeriod } =
      await loadTeacherAvailabilityRepository();

    await updateTeacherUnavailablePeriod("unavailable-1", "teacher-1", {
      reason: "Conference",
    });
    await deleteTeacherUnavailablePeriod("unavailable-1", "teacher-1");

    expect(prismaMock.teacherUnavailablePeriod.findFirst).toHaveBeenCalledWith({
      where: { id: "unavailable-1", teacherId: "teacher-1" },
    });
    expect(prismaMock.teacherUnavailablePeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "unavailable-1" },
      }),
    );
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

  it("builds unavailable-period conflicts for direct and class-group-owned teacher lessons", async () => {
    const directLesson = {
      id: "lesson-direct",
      title: "Direct lesson",
      startAt: new Date("2026-06-01T07:30:00.000Z"),
      endAt: new Date("2026-06-01T08:30:00.000Z"),
      teacherId: "teacher-1",
      classGroup: { id: "group-1", name: "Direct group" },
    };
    const classGroupLesson = {
      id: "lesson-class-group",
      title: "Class group lesson",
      startAt: new Date("2026-06-01T07:45:00.000Z"),
      endAt: new Date("2026-06-01T08:45:00.000Z"),
      teacherId: "other-teacher",
      classGroup: { id: "group-2", name: "Owned group" },
    };
    prismaMock.teacherAvailabilityRule.findMany.mockResolvedValueOnce([rule()]);
    prismaMock.teacherUnavailablePeriod.findMany.mockResolvedValueOnce([unavailablePeriod()]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([directLesson, classGroupLesson]);

    const { getTeacherAvailabilityAdminData } = await loadTeacherAvailabilityRepository();
    const result = await getTeacherAvailabilityAdminData("teacher-1");

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        }),
      }),
    );
    expect(result?.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonId: "lesson-direct",
          ownershipPath: "DIRECT_TEACHER",
          reason: "UNAVAILABLE_PERIOD",
        }),
        expect.objectContaining({
          lessonId: "lesson-class-group",
          ownershipPath: "CLASS_GROUP_TEACHER",
          reason: "UNAVAILABLE_PERIOD",
        }),
      ]),
    );
  });
});
