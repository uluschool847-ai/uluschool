import { AvailabilitySlotStatus, LessonStatus, type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  doesTimeRangeOverlap,
  isTeacherBlockedByUnavailablePeriod,
  isWithinWeeklyAvailability,
} from "@/lib/scheduling/availability";

type AvailabilityDatabase = typeof prisma | Prisma.TransactionClient;

export type TeacherUnavailableReason =
  | "OUTSIDE_AVAILABILITY"
  | "UNAVAILABLE_PERIOD"
  | "ALREADY_BOOKED"
  | "INVALID_TEACHER";

export type AvailabilityRuleInput = {
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone?: string | null;
  status?: AvailabilitySlotStatus | "ACTIVE" | "INACTIVE";
};

export type UnavailablePeriodInput = {
  teacherId: string;
  startAt: Date;
  endAt: Date;
  reason?: string | null;
};

export type AvailabilityCheckInput = {
  teacherId: string;
  startAt: Date;
  endAt: Date;
  excludeLessonId?: string;
};

const teacherSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} satisfies Prisma.AppUserSelect;

function assertValidWeekday(weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error("Weekday must be between 1 and 7.");
  }
}

function assertValidTime(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Time must use HH:mm format.");
  }
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) {
    throw new Error("Time must use HH:mm format.");
  }
}

function assertTimeRange(startTime: string, endTime: string) {
  assertValidTime(startTime);
  assertValidTime(endTime);
  if (startTime >= endTime) {
    throw new Error("Availability start time must be before end time.");
  }
}

function assertDateRange(startAt: Date, endAt: Date) {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    throw new Error("Start date must be valid.");
  }
  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    throw new Error("End date must be valid.");
  }
  if (startAt >= endAt) {
    throw new Error("Unavailable period start must be before end.");
  }
}

async function assertTeacher(teacherId: string, database: AvailabilityDatabase = prisma) {
  const teacher = await database.appUser.findUnique({
    where: { id: teacherId },
    select: { id: true, role: true },
  });
  if (!teacher) {
    throw new Error("Invalid teacher: teacher not found.");
  }
  if (teacher.role !== UserRole.TEACHER) {
    throw new Error("Invalid teacher: account must have teacher role.");
  }
  return teacher;
}

function ruleData(input: AvailabilityRuleInput) {
  assertValidWeekday(input.weekday);
  assertTimeRange(input.startTime, input.endTime);
  return {
    teacherId: input.teacherId,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    timezone: input.timezone?.trim() || "Europe/Kiev",
    status: input.status ?? AvailabilitySlotStatus.ACTIVE,
  };
}

async function getOwnedRule(id: string, teacherId: string, database: AvailabilityDatabase) {
  const rule = await database.teacherAvailabilityRule.findUnique({ where: { id } });
  if (!rule || rule.teacherId !== teacherId) {
    throw new Error("Availability rule not found for teacher.");
  }
  return rule;
}

async function getOwnedPeriod(id: string, teacherId: string, database: AvailabilityDatabase) {
  const period = await database.teacherUnavailablePeriod.findUnique({ where: { id } });
  if (!period || period.teacherId !== teacherId) {
    throw new Error("Unavailable period not found for teacher.");
  }
  return period;
}

export async function listTeacherAvailabilityRules(
  teacherId: string,
  database: AvailabilityDatabase = prisma,
) {
  return database.teacherAvailabilityRule.findMany({
    where: { teacherId },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
}

export async function createTeacherAvailabilityRule(
  input: AvailabilityRuleInput,
  database: AvailabilityDatabase = prisma,
) {
  await assertTeacher(input.teacherId, database);
  return database.teacherAvailabilityRule.create({
    data: ruleData(input),
  });
}

export async function updateTeacherAvailabilityRule(
  id: string,
  teacherId: string,
  input: Partial<AvailabilityRuleInput>,
  database: AvailabilityDatabase = prisma,
) {
  const before = await getOwnedRule(id, teacherId, database);
  const next = {
    teacherId,
    weekday: input.weekday ?? before.weekday,
    startTime: input.startTime ?? before.startTime,
    endTime: input.endTime ?? before.endTime,
    timezone: input.timezone ?? before.timezone,
    status: input.status ?? before.status,
  };
  const data = ruleData(next);
  const after = await database.teacherAvailabilityRule.update({
    where: { id },
    data: {
      weekday: data.weekday,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
      status: data.status,
    },
  });
  return { before, after };
}

export async function setTeacherAvailabilityRuleStatus(
  id: string,
  teacherId: string,
  status: AvailabilitySlotStatus | "ACTIVE" | "INACTIVE",
  database: AvailabilityDatabase = prisma,
) {
  const before = await getOwnedRule(id, teacherId, database);
  const after = await database.teacherAvailabilityRule.update({
    where: { id },
    data: { status },
  });
  return { before, after };
}

export async function deleteTeacherAvailabilityRule(
  id: string,
  teacherId: string,
  database: AvailabilityDatabase = prisma,
) {
  await getOwnedRule(id, teacherId, database);
  return database.teacherAvailabilityRule.delete({ where: { id } });
}

export async function listTeacherUnavailablePeriods(
  teacherId: string,
  database: AvailabilityDatabase = prisma,
) {
  return database.teacherUnavailablePeriod.findMany({
    where: { teacherId },
    orderBy: [{ startAt: "asc" }],
  });
}

export async function createTeacherUnavailablePeriod(
  input: UnavailablePeriodInput,
  database: AvailabilityDatabase = prisma,
) {
  await assertTeacher(input.teacherId, database);
  assertDateRange(input.startAt, input.endAt);
  return database.teacherUnavailablePeriod.create({
    data: {
      teacherId: input.teacherId,
      startAt: input.startAt,
      endAt: input.endAt,
      reason: input.reason?.trim() || null,
    },
  });
}

export async function updateTeacherUnavailablePeriod(
  id: string,
  teacherId: string,
  input: Partial<UnavailablePeriodInput>,
  database: AvailabilityDatabase = prisma,
) {
  const before = await getOwnedPeriod(id, teacherId, database);
  const startAt = input.startAt ?? before.startAt;
  const endAt = input.endAt ?? before.endAt;
  assertDateRange(startAt, endAt);
  const after = await database.teacherUnavailablePeriod.update({
    where: { id },
    data: {
      startAt,
      endAt,
      reason: input.reason === undefined ? before.reason : input.reason?.trim() || null,
    },
  });
  return { before, after };
}

export async function deleteTeacherUnavailablePeriod(
  id: string,
  teacherId: string,
  database: AvailabilityDatabase = prisma,
) {
  await getOwnedPeriod(id, teacherId, database);
  return database.teacherUnavailablePeriod.delete({ where: { id } });
}

export async function checkTeacherAvailability(
  input: AvailabilityCheckInput,
  database: AvailabilityDatabase = prisma,
): Promise<{ available: true } | { available: false; reason: TeacherUnavailableReason }> {
  if (input.startAt >= input.endAt) {
    return { available: false, reason: "OUTSIDE_AVAILABILITY" };
  }

  const teacher = await database.appUser.findUnique({
    where: { id: input.teacherId },
    select: { id: true, role: true },
  });
  if (!teacher || teacher.role !== UserRole.TEACHER) {
    return { available: false, reason: "INVALID_TEACHER" };
  }

  const rules = await database.teacherAvailabilityRule.findMany({
    where: { teacherId: input.teacherId, status: AvailabilitySlotStatus.ACTIVE },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  const isInsideAvailability = rules.some((rule) =>
    isWithinWeeklyAvailability(input.startAt, input.endAt, rule),
  );
  if (!isInsideAvailability) {
    return { available: false, reason: "OUTSIDE_AVAILABILITY" };
  }

  const periods = await database.teacherUnavailablePeriod.findMany({
    where: {
      teacherId: input.teacherId,
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
    },
    orderBy: [{ startAt: "asc" }],
  });
  if (isTeacherBlockedByUnavailablePeriod(input.startAt, input.endAt, periods)) {
    return { available: false, reason: "UNAVAILABLE_PERIOD" };
  }

  const booking = await database.scheduledClass.findFirst({
    where: {
      teacherId: input.teacherId,
      id: input.excludeLessonId ? { not: input.excludeLessonId } : undefined,
      status: { notIn: [LessonStatus.CANCELLED, LessonStatus.COMPLETED] },
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
    },
    select: { id: true },
  });

  if (booking) {
    return { available: false, reason: "ALREADY_BOOKED" };
  }

  const scopedBooking = await database.scheduledClass.findFirst({
    where: {
      OR: [{ teacherId: input.teacherId }, { classGroup: { teacherId: input.teacherId } }],
      id: input.excludeLessonId ? { not: input.excludeLessonId } : undefined,
      status: { notIn: [LessonStatus.CANCELLED, LessonStatus.COMPLETED] },
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
    },
    select: { id: true },
  });

  if (scopedBooking) {
    return { available: false, reason: "ALREADY_BOOKED" };
  }

  return { available: true };
}

export async function findAvailableTeachers(
  input: {
    startAt: Date;
    endAt: Date;
    teacherIds?: string[];
    excludeLessonId?: string;
  },
  database: AvailabilityDatabase = prisma,
) {
  const where: Prisma.AppUserWhereInput = {
    role: UserRole.TEACHER,
    isActive: true,
  };
  if (input.teacherIds) {
    where.id = { in: input.teacherIds };
  }
  const teachers = await database.appUser.findMany({
    where,
    select: teacherSelect,
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
  });

  const results = [];
  for (const teacher of teachers) {
    const availability = await checkTeacherAvailability(
      {
        teacherId: teacher.id,
        startAt: input.startAt,
        endAt: input.endAt,
        excludeLessonId: input.excludeLessonId,
      },
      database,
    );
    results.push(
      availability.available
        ? { teacherId: teacher.id, available: true }
        : { teacherId: teacher.id, available: false, reason: availability.reason },
    );
  }
  return results;
}

export async function getTeacherAvailabilityAdminData(teacherId: string) {
  const teacher = await prisma.appUser.findUnique({
    where: { id: teacherId },
    select: teacherSelect,
  });
  if (!teacher) return null;

  const [rules, unavailablePeriods, upcomingLessons] = await Promise.all([
    listTeacherAvailabilityRules(teacherId),
    listTeacherUnavailablePeriods(teacherId),
    prisma.scheduledClass.findMany({
      where: {
        OR: [{ teacherId }, { classGroup: { teacherId } }],
        startAt: { gte: new Date() },
      },
      include: {
        classGroup: { select: { id: true, name: true } },
      },
      orderBy: [{ startAt: "asc" }],
      take: 20,
    }),
  ]);

  const conflicts = [];
  for (const lesson of upcomingLessons) {
    const ruleMatch = rules.some((rule) =>
      isWithinWeeklyAvailability(lesson.startAt, lesson.endAt, rule),
    );
    if (!ruleMatch) {
      conflicts.push({
        lessonId: lesson.id,
        title: lesson.title,
        reason: "OUTSIDE_AVAILABILITY",
        startAt: lesson.startAt,
        endAt: lesson.endAt,
        classGroup: lesson.classGroup,
        ownershipPath: lesson.teacherId === teacherId ? "DIRECT_TEACHER" : "CLASS_GROUP_TEACHER",
      });
      continue;
    }

    const periodConflict = unavailablePeriods.some((period) =>
      doesTimeRangeOverlap(lesson.startAt, lesson.endAt, period.startAt, period.endAt),
    );
    if (periodConflict) {
      conflicts.push({
        lessonId: lesson.id,
        title: lesson.title,
        reason: "UNAVAILABLE_PERIOD",
        startAt: lesson.startAt,
        endAt: lesson.endAt,
        classGroup: lesson.classGroup,
        ownershipPath: lesson.teacherId === teacherId ? "DIRECT_TEACHER" : "CLASS_GROUP_TEACHER",
      });
      continue;
    }

    const overlapping = await prisma.scheduledClass.findFirst({
      where: {
        OR: [{ teacherId }, { classGroup: { teacherId } }],
        id: { not: lesson.id },
        status: { notIn: [LessonStatus.CANCELLED, LessonStatus.COMPLETED] },
        startAt: { lt: lesson.endAt },
        endAt: { gt: lesson.startAt },
      },
      select: { id: true },
    });
    if (overlapping) {
      conflicts.push({
        lessonId: lesson.id,
        title: lesson.title,
        reason: "ALREADY_BOOKED",
        startAt: lesson.startAt,
        endAt: lesson.endAt,
        classGroup: lesson.classGroup,
        ownershipPath: lesson.teacherId === teacherId ? "DIRECT_TEACHER" : "CLASS_GROUP_TEACHER",
      });
    }
  }

  return {
    teacher: { ...teacher, name: teacher.fullName },
    rules,
    unavailablePeriods,
    upcomingLessons,
    conflicts,
  };
}

export async function getTeacherAvailabilityPortalData(teacherId: string) {
  return getTeacherAvailabilityAdminData(teacherId);
}
