import {
  ClassGroupStatus,
  LessonStatus,
  type Prisma,
  MeetingProvider as PrismaMeetingProvider,
  UserRole,
} from "@prisma/client";

import { assertValidLessonStatusTransition, parseLessonStatus } from "@/lib/lessons/lesson-status";
import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { prisma } from "@/lib/prisma";
import { checkTeacherAvailability } from "@/lib/repositories/teacher-availability-repository";
import { localDateTimeToUtc } from "@/lib/scheduling/availability";

type LessonDatabase = typeof prisma | Prisma.TransactionClient;

export type MeetingProvider = PrismaMeetingProvider | string;

export type LessonInput = {
  classGroupId: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  teacherId?: string | null;
  subjectId?: string | null;
  liveLessonUrl: string | null;
  meetingProvider?: MeetingProvider | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingCreatedAt?: Date | null;
  meetingUpdatedAt?: Date | null;
  allowPendingGoogleMeet?: boolean;
  reminderMinutesBefore?: number | null;
};

export type RecurringLessonInput = {
  classGroupId: string;
  title: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  weekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  teacherId?: string | null;
  subjectId?: string | null;
  liveLessonUrl: string | null;
  meetingProvider?: MeetingProvider | null;
};

type LessonStudentRecord = { id: string; fullName: string; email?: string | null };
type LessonTeacherRecord = { id: string; fullName: string; email: string; role?: UserRole };
type LessonSubjectRecord = { id: string; name: string; slug: string };
type LessonClassGroupRecord = {
  id: string;
  name: string;
  status?: ClassGroupStatus;
  teacherId?: string | null;
  subjectId?: string | null;
  students?: LessonStudentRecord[];
};

export type AdminLessonRecord = {
  id: string;
  classGroupId: string | null;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: LessonStatus | string;
  liveLessonUrl: string | null;
  meetingProvider: PrismaMeetingProvider | string;
  googleCalendarEventId: string | null;
  googleMeetSpaceName: string | null;
  meetingCreatedAt: Date | null;
  meetingUpdatedAt: Date | null;
  teacherId: string | null;
  subjectId: string | null;
  reminderMinutesBefore: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
  completedAt: Date | null;
  rescheduledFromId: string | null;
  classGroup: LessonClassGroupRecord | null;
  teacher: LessonTeacherRecord | null;
  subject: LessonSubjectRecord | null;
  students: LessonStudentRecord[];
  assignmentsCount: number;
  submissionsCount: number;
  materialsCount: number;
  remindersCount: number;
  createdAt?: Date;
  updatedAt?: Date;
};
export type LessonMutationResult = AdminLessonRecord & {
  before: Partial<AdminLessonRecord>;
  after: Partial<AdminLessonRecord>;
};

const classGroupSelect = {
  id: true,
  name: true,
  status: true,
  teacherId: true,
  subjectId: true,
  students: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
    orderBy: { fullName: "asc" },
  },
} satisfies Prisma.ClassGroupSelect;

const teacherSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} satisfies Prisma.AppUserSelect;

const subjectSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.SubjectSelect;

const lessonInclude = {
  classGroup: { select: classGroupSelect },
  teacher: { select: teacherSelect },
  subject: { select: subjectSelect },
  students: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
    orderBy: { fullName: "asc" },
  },
  assignments: {
    select: {
      id: true,
      submissions: { select: { id: true } },
    },
  },
  courseMaterials: { select: { id: true } },
  _count: { select: { reminders: true } },
} satisfies Prisma.ScheduledClassInclude;

type LessonWithRelations = Prisma.ScheduledClassGetPayload<{ include: typeof lessonInclude }>;

function ensureValidTimeRange(startAt: Date, endAt: Date) {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    throw new Error("Start date must be valid.");
  }
  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    throw new Error("End date must be valid.");
  }
  if (startAt >= endAt) {
    throw new Error("Lesson start must be before lesson end.");
  }
}

function normalizeMeetingProvider(provider?: MeetingProvider | null): PrismaMeetingProvider {
  return provider === PrismaMeetingProvider.MANUAL_URL
    ? PrismaMeetingProvider.MANUAL_URL
    : PrismaMeetingProvider.GOOGLE_MEET;
}

function ensureLiveUrl(
  liveLessonUrl?: string | null,
  meetingProvider?: MeetingProvider | null,
  options: { required?: boolean } = {},
) {
  const provider = normalizeMeetingProvider(meetingProvider);
  const validation = validateLiveLessonUrl(liveLessonUrl, provider, {
    required: options.required ?? true,
  });

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return {
    liveLessonUrl: validation.url,
    meetingProvider: provider,
  };
}

async function assertTeacherAccount(teacherId: string, database: LessonDatabase) {
  const teacher = await database.appUser.findUnique({
    where: { id: teacherId },
    select: { id: true, role: true },
  });

  if (!teacher || teacher.role !== UserRole.TEACHER) {
    throw new Error("Selected teacher must be an existing teacher account.");
  }

  return teacher;
}

async function assertSubjectExists(subjectId: string, database: LessonDatabase) {
  const subject = await database.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });

  if (!subject) {
    throw new Error("Selected subject must be an existing subject.");
  }

  return subject;
}

async function getActiveClassGroup(classGroupId: string, database: LessonDatabase) {
  const classGroup = await database.classGroup.findUnique({
    where: { id: classGroupId },
    select: {
      id: true,
      status: true,
      teacherId: true,
      subjectId: true,
    },
  });

  if (!classGroup) {
    throw new Error("Class group not found.");
  }
  if (classGroup.status !== ClassGroupStatus.ACTIVE) {
    throw new Error("Class group must be ACTIVE before lessons can be scheduled.");
  }

  return classGroup;
}

type LooseLessonRecord = Record<string, unknown> & {
  id?: string;
  classGroupId?: string | null;
  title?: string;
  description?: string | null;
  startAt?: Date;
  endAt?: Date;
  timezone?: string | null;
  status?: LessonStatus | string | null;
  liveLessonUrl?: string | null;
  meetingProvider?: PrismaMeetingProvider | string | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingCreatedAt?: Date | null;
  meetingUpdatedAt?: Date | null;
  teacherId?: string | null;
  subjectId?: string | null;
  reminderMinutesBefore?: number | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  completedAt?: Date | null;
  rescheduledFromId?: string | null;
  classGroup?: unknown;
  teacher?: unknown;
  subject?: unknown;
  students?: unknown[];
  assignments?: Array<{ submissions?: unknown[]; _count?: { submissions?: number } }>;
  courseMaterials?: unknown[];
  _count?: { assignments?: number; courseMaterials?: number; reminders?: number };
  assignmentsCount?: number;
  submissionsCount?: number;
  materialsCount?: number;
  remindersCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

function mapLessonRecord(lesson: LessonWithRelations | LooseLessonRecord): AdminLessonRecord {
  const source = lesson as LooseLessonRecord;
  return {
    id: source.id ?? "",
    classGroupId: source.classGroupId ?? null,
    title: source.title ?? "",
    description: source.description ?? null,
    startAt: source.startAt ?? new Date(0),
    endAt: source.endAt ?? new Date(0),
    timezone: source.timezone ?? "Africa/Nairobi",
    status: source.status ?? LessonStatus.SCHEDULED,
    liveLessonUrl: source.liveLessonUrl ?? null,
    meetingProvider: source.meetingProvider ?? PrismaMeetingProvider.GOOGLE_MEET,
    googleCalendarEventId: source.googleCalendarEventId ?? null,
    googleMeetSpaceName: source.googleMeetSpaceName ?? null,
    meetingCreatedAt: source.meetingCreatedAt ?? null,
    meetingUpdatedAt: source.meetingUpdatedAt ?? null,
    teacherId: source.teacherId ?? null,
    subjectId: source.subjectId ?? null,
    reminderMinutesBefore: source.reminderMinutesBefore ?? 60,
    cancelledAt: source.cancelledAt ?? null,
    cancelReason: source.cancelReason ?? null,
    completedAt: source.completedAt ?? null,
    rescheduledFromId: source.rescheduledFromId ?? null,
    classGroup: (source.classGroup ?? null) as AdminLessonRecord["classGroup"],
    teacher: (source.teacher ?? null) as AdminLessonRecord["teacher"],
    subject: (source.subject ?? null) as AdminLessonRecord["subject"],
    students: (source.students ?? []) as AdminLessonRecord["students"],
    assignmentsCount:
      source.assignmentsCount ?? source._count?.assignments ?? source.assignments?.length ?? 0,
    submissionsCount:
      source.submissionsCount ??
      source.assignments?.reduce(
        (
          total: number,
          assignment: { submissions?: unknown[]; _count?: { submissions?: number } },
        ) => total + (assignment._count?.submissions ?? assignment.submissions?.length ?? 0),
        0,
      ) ??
      0,
    materialsCount:
      source.materialsCount ??
      source._count?.courseMaterials ??
      source.courseMaterials?.length ??
      0,
    remindersCount: source.remindersCount ?? source._count?.reminders ?? 0,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function mutationSnapshot(lesson: LooseLessonRecord) {
  return {
    id: lesson.id,
    classGroupId: lesson.classGroupId ?? null,
    title: lesson.title,
    description: lesson.description ?? null,
    startAt: lesson.startAt,
    endAt: lesson.endAt,
    timezone: lesson.timezone ?? "Africa/Nairobi",
    status: lesson.status ?? LessonStatus.SCHEDULED,
    liveLessonUrl: lesson.liveLessonUrl ?? null,
    meetingProvider: lesson.meetingProvider ?? PrismaMeetingProvider.GOOGLE_MEET,
    googleCalendarEventId: lesson.googleCalendarEventId ?? null,
    googleMeetSpaceName: lesson.googleMeetSpaceName ?? null,
    meetingCreatedAt: lesson.meetingCreatedAt ?? null,
    meetingUpdatedAt: lesson.meetingUpdatedAt ?? null,
    teacherId: lesson.teacherId ?? null,
    subjectId: lesson.subjectId ?? null,
    reminderMinutesBefore: lesson.reminderMinutesBefore ?? 60,
    cancelledAt: lesson.cancelledAt ?? null,
    cancelReason: lesson.cancelReason ?? null,
    completedAt: lesson.completedAt ?? null,
    rescheduledFromId: lesson.rescheduledFromId ?? null,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

async function validateLessonInput(input: LessonInput, database: LessonDatabase) {
  ensureValidTimeRange(input.startAt, input.endAt);
  const meeting = ensureLiveUrl(input.liveLessonUrl, input.meetingProvider, {
    required: !(
      input.allowPendingGoogleMeet &&
      normalizeMeetingProvider(input.meetingProvider) === PrismaMeetingProvider.GOOGLE_MEET
    ),
  });

  const classGroup = await getActiveClassGroup(input.classGroupId, database);
  const teacherId = input.teacherId || classGroup.teacherId;
  const subjectId = input.subjectId ?? classGroup.subjectId;

  if (!teacherId) {
    throw new Error("Lesson must have a teacher.");
  }
  await assertTeacherAccount(teacherId, database);
  if (input.subjectId) {
    await assertSubjectExists(input.subjectId, database);
  }

  return { teacherId, subjectId, ...meeting };
}

function relationConnect(id: string | null | undefined) {
  return id ? { connect: { id } } : undefined;
}

export async function listAdminLessons(
  filters: {
    teacherId?: string;
    classGroupId?: string;
    subjectId?: string;
    status?: LessonStatus;
    from?: Date;
    to?: Date;
  } = {},
  database: LessonDatabase = prisma,
) {
  const where: Prisma.ScheduledClassWhereInput = {};
  if (filters.teacherId) where.teacherId = filters.teacherId;
  if (filters.classGroupId) where.classGroupId = filters.classGroupId;
  if (filters.subjectId) where.subjectId = filters.subjectId;
  const status = parseLessonStatus(filters.status);
  if (status) where.status = status;
  if (filters.from || filters.to) {
    where.startAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const lessons = await database.scheduledClass.findMany({
    where,
    include: {
      classGroup: { select: classGroupSelect },
      teacher: { select: teacherSelect },
      subject: { select: subjectSelect },
      _count: { select: { reminders: true } },
    },
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });

  return lessons.map((lesson) => mapLessonRecord(lesson as unknown as LessonWithRelations));
}

export async function getLessonById(id: string, database: LessonDatabase = prisma) {
  const lesson = await database.scheduledClass.findUnique({
    where: { id },
    include: lessonInclude,
  });
  return lesson ? mapLessonRecord(lesson as LessonWithRelations) : null;
}

export async function createLesson(input: LessonInput, database: LessonDatabase = prisma) {
  const { teacherId, subjectId, liveLessonUrl, meetingProvider } = await validateLessonInput(
    input,
    database,
  );
  const meetingTimestamp = input.meetingCreatedAt ?? input.meetingUpdatedAt ?? new Date();

  const created = await database.scheduledClass.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone || "Africa/Nairobi",
      status: LessonStatus.SCHEDULED,
      liveLessonUrl,
      meetingProvider,
      googleCalendarEventId: input.googleCalendarEventId ?? null,
      googleMeetSpaceName: input.googleMeetSpaceName ?? null,
      meetingCreatedAt: input.meetingCreatedAt ?? meetingTimestamp,
      meetingUpdatedAt: input.meetingUpdatedAt ?? meetingTimestamp,
      reminderMinutesBefore: input.reminderMinutesBefore ?? 60,
      classGroup: { connect: { id: input.classGroupId } },
      teacher: { connect: { id: teacherId } },
      ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
    },
    include: lessonInclude,
  });

  return mapLessonRecord(created as LessonWithRelations);
}

export async function updateLesson(
  id: string,
  input: Partial<LessonInput> & { status?: LessonStatus },
  database: LessonDatabase = prisma,
): Promise<LessonMutationResult> {
  const before = await database.scheduledClass.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!before) throw new Error("Lesson not found.");
  if (input.status) {
    assertValidLessonStatusTransition(before.status, input.status);
  }

  if (input.startAt || input.endAt) {
    ensureValidTimeRange(input.startAt ?? before.startAt, input.endAt ?? before.endAt);
  }
  const meetingChanged = input.liveLessonUrl !== undefined || input.meetingProvider !== undefined;
  const meeting = meetingChanged
    ? ensureLiveUrl(
        input.liveLessonUrl ?? before.liveLessonUrl,
        input.meetingProvider ?? before.meetingProvider,
      )
    : null;
  if (input.teacherId) {
    await assertTeacherAccount(input.teacherId, database);
  }
  if (input.subjectId) {
    await assertSubjectExists(input.subjectId, database);
  }

  const after = await database.scheduledClass.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.startAt ? { startAt: input.startAt } : {}),
      ...(input.endAt ? { endAt: input.endAt } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone || null } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(meeting
        ? {
            liveLessonUrl: meeting.liveLessonUrl,
            meetingProvider: meeting.meetingProvider,
            meetingUpdatedAt: input.meetingUpdatedAt ?? new Date(),
          }
        : {}),
      ...(input.googleCalendarEventId !== undefined
        ? { googleCalendarEventId: input.googleCalendarEventId }
        : {}),
      ...(input.googleMeetSpaceName !== undefined
        ? { googleMeetSpaceName: input.googleMeetSpaceName }
        : {}),
      ...(input.meetingCreatedAt !== undefined ? { meetingCreatedAt: input.meetingCreatedAt } : {}),
      ...(input.reminderMinutesBefore !== undefined
        ? { reminderMinutesBefore: input.reminderMinutesBefore ?? 60 }
        : {}),
      ...(input.teacherId !== undefined
        ? input.teacherId
          ? { teacher: { connect: { id: input.teacherId } } }
          : { teacher: { disconnect: true } }
        : {}),
      ...(input.subjectId !== undefined
        ? input.subjectId
          ? { subject: { connect: { id: input.subjectId } } }
          : { subject: { disconnect: true } }
        : {}),
    },
    include: lessonInclude,
  });

  return Object.assign(mapLessonRecord(after as LessonWithRelations), {
    before: mutationSnapshot(before as unknown as LooseLessonRecord),
    after: mutationSnapshot(after as unknown as LooseLessonRecord),
  });
}

export async function updateLessonMeetingLink(
  id: string,
  input: {
    meetingProvider: MeetingProvider;
    liveLessonUrl?: string | null;
    meetingUpdatedAt?: Date;
  },
  database: LessonDatabase = prisma,
): Promise<LessonMutationResult> {
  const before = await database.scheduledClass.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!before) throw new Error("Lesson not found.");

  const meeting = ensureLiveUrl(input.liveLessonUrl ?? null, input.meetingProvider, {
    required: false,
  });
  const meetingUpdatedAt = input.meetingUpdatedAt ?? new Date();

  const after = await database.scheduledClass.update({
    where: { id },
    data: {
      liveLessonUrl: meeting.liveLessonUrl,
      meetingProvider: meeting.meetingProvider,
      meetingUpdatedAt,
    },
    include: lessonInclude,
  });

  return Object.assign(mapLessonRecord(after as LessonWithRelations), {
    before: mutationSnapshot(before as unknown as LooseLessonRecord),
    after: mutationSnapshot(after as unknown as LooseLessonRecord),
  });
}

export async function rescheduleLesson(
  id: string,
  input: {
    startAt: Date;
    endAt: Date;
    timezone: string;
    teacherId?: string | null;
    liveLessonUrl?: string | null;
    googleCalendarEventId?: string | null;
    googleMeetSpaceName?: string | null;
    meetingUpdatedAt?: Date | null;
  },
  database: LessonDatabase = prisma,
): Promise<LessonMutationResult> {
  const before = await database.scheduledClass.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!before) throw new Error("Lesson not found.");
  ensureValidTimeRange(input.startAt, input.endAt);
  assertValidLessonStatusTransition(before.status, LessonStatus.RESCHEDULED);
  if (input.teacherId) await assertTeacherAccount(input.teacherId, database);
  const meeting = input.liveLessonUrl
    ? ensureLiveUrl(input.liveLessonUrl, before.meetingProvider)
    : null;

  const after = await database.scheduledClass.update({
    where: { id },
    data: {
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone,
      status: LessonStatus.RESCHEDULED,
      rescheduledFromId: before.rescheduledFromId ?? before.id,
      ...(meeting
        ? {
            liveLessonUrl: meeting.liveLessonUrl,
            meetingUpdatedAt: input.meetingUpdatedAt ?? new Date(),
          }
        : {}),
      ...(input.googleCalendarEventId !== undefined
        ? { googleCalendarEventId: input.googleCalendarEventId }
        : {}),
      ...(input.googleMeetSpaceName !== undefined
        ? { googleMeetSpaceName: input.googleMeetSpaceName }
        : {}),
      ...(input.teacherId !== undefined
        ? input.teacherId
          ? { teacher: { connect: { id: input.teacherId } } }
          : { teacher: { disconnect: true } }
        : {}),
    },
    include: lessonInclude,
  });

  return Object.assign(mapLessonRecord(after as LessonWithRelations), {
    before: mutationSnapshot(before as unknown as LooseLessonRecord),
    after: mutationSnapshot(after as unknown as LooseLessonRecord),
  });
}

export async function cancelLesson(
  id: string,
  reason: string,
  database: LessonDatabase = prisma,
): Promise<LessonMutationResult> {
  if (!reason.trim()) throw new Error("Cancel reason is required.");
  const before = await database.scheduledClass.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!before) throw new Error("Lesson not found.");
  assertValidLessonStatusTransition(before.status, LessonStatus.CANCELLED);

  const after = await database.scheduledClass.update({
    where: { id },
    data: {
      status: LessonStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason.trim(),
    },
    include: lessonInclude,
  });

  return Object.assign(mapLessonRecord(after as LessonWithRelations), {
    before: mutationSnapshot(before as unknown as LooseLessonRecord),
    after: mutationSnapshot(after as unknown as LooseLessonRecord),
  });
}

export async function completeLesson(
  id: string,
  database: LessonDatabase = prisma,
): Promise<LessonMutationResult> {
  const before = await database.scheduledClass.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!before) throw new Error("Lesson not found.");
  assertValidLessonStatusTransition(before.status, LessonStatus.COMPLETED);

  const after = await database.scheduledClass.update({
    where: { id },
    data: { status: LessonStatus.COMPLETED, completedAt: new Date() },
    include: lessonInclude,
  });

  return Object.assign(mapLessonRecord(after as LessonWithRelations), {
    before: mutationSnapshot(before as unknown as LooseLessonRecord),
    after: mutationSnapshot(after as unknown as LooseLessonRecord),
  });
}

export async function deleteLesson(id: string, database: LessonDatabase = prisma) {
  const existing = await database.scheduledClass.findUnique({
    where: { id },
    include: {
      assignments: {
        select: { _count: { select: { submissions: true } } },
      },
      _count: { select: { assignments: true, courseMaterials: true, reminders: true } },
    },
  });
  if (!existing) throw new Error("Lesson not found.");

  const submissions =
    existing.assignments?.reduce(
      (total, assignment) => total + (assignment._count?.submissions ?? 0),
      0,
    ) ?? 0;
  const blockers = [
    ["assignments", existing._count?.assignments ?? 0],
    ["submissions", submissions],
    ["course materials", existing._count?.courseMaterials ?? 0],
    ["reminders", existing._count?.reminders ?? 0],
  ].filter(([, count]) => Number(count) > 0);

  if (blockers.length > 0) {
    throw new Error(
      `Lesson has dependencies and cannot be deleted safely (${blockers
        .map(([name, count]) => `${name}: ${count}`)
        .join(", ")}).`,
    );
  }

  await database.scheduledClass.delete({ where: { id } });
  return { id };
}

export async function listLessonsForStudent(
  studentId: string,
  range: { from: Date; to: Date },
  database: LessonDatabase = prisma,
) {
  const lessons = await database.scheduledClass.findMany({
    where: {
      startAt: { gte: range.from, lt: range.to },
      OR: [
        { classGroup: { students: { some: { id: studentId } } } },
        { students: { some: { id: studentId } } },
      ],
    },
    include: lessonInclude,
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });
  return lessons.map((lesson) => mapLessonRecord(lesson as LessonWithRelations));
}

export async function listLessonsForTeacher(
  teacherId: string,
  range: { from: Date; to: Date },
  database: LessonDatabase = prisma,
) {
  const lessons = await database.scheduledClass.findMany({
    where: {
      startAt: { gte: range.from, lt: range.to },
      OR: [{ teacherId }, { classGroup: { teacherId } }],
    },
    include: lessonInclude,
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });
  return lessons.map((lesson) => mapLessonRecord(lesson as LessonWithRelations));
}

function parseTimeParts(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("Lesson time must be valid.");
  }
  return { hour, minute };
}

function localDateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDateAtTime(date: Date, time: string, timezone = "Africa/Nairobi") {
  const { hour, minute } = parseTimeParts(time);
  return localDateTimeToUtc({
    value: `${localDateLabel(date)}T${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}`,
    timezone,
  });
}

function sameDayAndTimeKey(date: Date) {
  return date.toISOString().slice(0, 16);
}

function availabilityFailureMessage(reason: string) {
  if (reason === "OUTSIDE_AVAILABILITY") {
    return "Teacher is not available at this time. The lesson is outside weekly availability.";
  }
  if (reason === "UNAVAILABLE_PERIOD") {
    return "Teacher is not available at this time. The lesson overlaps an unavailable period.";
  }
  if (reason === "ALREADY_BOOKED") {
    return "Teacher is not available at this time. The teacher is already booked.";
  }
  return "Teacher is not available at this time.";
}

export async function createRecurringLessons(
  input: RecurringLessonInput,
  database: LessonDatabase = prisma,
) {
  if (input.weekdays.length === 0) throw new Error("At least one weekday is required.");
  if (input.startDate > input.endDate) throw new Error("Recurring date range is invalid.");
  const { teacherId, subjectId, liveLessonUrl, meetingProvider } = await validateLessonInput(
    {
      classGroupId: input.classGroupId,
      title: input.title,
      startAt: buildDateAtTime(input.startDate, input.startTime, input.timezone),
      endAt: buildDateAtTime(input.startDate, input.endTime, input.timezone),
      teacherId: input.teacherId,
      subjectId: input.subjectId,
      liveLessonUrl: input.liveLessonUrl,
      meetingProvider: input.meetingProvider,
    },
    database,
  );

  const existing = await database.scheduledClass.findMany({
    where: {
      classGroupId: input.classGroupId,
      startAt: {
        gte: input.startDate,
        lte: input.endDate,
      },
    },
    select: { id: true, startAt: true },
  });
  const existingKeys = new Set(existing.map((lesson) => sameDayAndTimeKey(lesson.startAt)));

  const dates: Array<{ startAt: Date; endAt: Date }> = [];
  const cursor = new Date(input.startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(input.endDate);
  endDate.setUTCHours(23, 59, 59, 999);
  while (cursor <= endDate) {
    if (input.weekdays.includes(cursor.getUTCDay())) {
      const startAt = buildDateAtTime(cursor, input.startTime, input.timezone);
      const endAt = buildDateAtTime(cursor, input.endTime, input.timezone);
      ensureValidTimeRange(startAt, endAt);
      dates.push({ startAt, endAt });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const newDates = dates.filter(({ startAt }) => !existingKeys.has(sameDayAndTimeKey(startAt)));

  for (const { startAt, endAt } of newDates) {
    const availability = await checkTeacherAvailability(
      {
        teacherId,
        startAt,
        endAt,
      },
      database,
    );
    if (!availability.available) {
      throw new Error(availabilityFailureMessage(availability.reason));
    }
  }

  const createRows = newDates.map(({ startAt, endAt }) => {
    const meetingTimestamp = new Date();

    return {
      classGroupId: input.classGroupId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      startAt,
      endAt,
      timezone: input.timezone || "Africa/Nairobi",
      status: LessonStatus.SCHEDULED,
      liveLessonUrl,
      meetingProvider,
      meetingCreatedAt: meetingTimestamp,
      meetingUpdatedAt: meetingTimestamp,
      teacherId,
      subjectId,
      reminderMinutesBefore: 60,
    };
  });

  if (createRows.length > 0) {
    await database.scheduledClass.createMany({ data: createRows });
  }

  const created = createRows.length
    ? await database.scheduledClass.findMany({
        where: {
          classGroupId: input.classGroupId,
          startAt: { in: createRows.map((row) => row.startAt) },
        },
        include: lessonInclude,
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      })
    : [];

  return {
    createdCount: created.length,
    skippedCount: dates.length - createRows.length,
    created: created.map((lesson) => mapLessonRecord(lesson as LessonWithRelations)),
  };
}
