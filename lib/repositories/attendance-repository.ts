import { AttendanceStatus, type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const CORRECTION_WINDOW_HOURS = 24;

type AttendanceInput = {
  attendanceId?: string;
  scheduledClassId: string;
  studentId: string;
  status: AttendanceStatus | "PRESENT" | "LATE" | "ABSENT";
  lateMinutes?: number | null;
  reason?: string | null;
  now?: Date;
};

type AttendanceRecordShape = {
  id: string;
  scheduledClassId: string;
  studentId: string;
  status: AttendanceStatus | string;
  lateMinutes?: number | null;
  reason?: string | null;
  markedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

type StudentShape = {
  id: string;
  fullName: string;
  email?: string | null;
};

type ScheduledClassShape = {
  id: string;
  title?: string;
  status?: string;
  startAt: Date;
  endAt: Date;
  teacherId?: string | null;
  classGroupId?: string | null;
  subjectId?: string | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string | null } | null;
  students?: StudentShape[];
  classGroup?: {
    id?: string;
    name?: string;
    teacherId?: string | null;
    students?: StudentShape[];
  } | null;
  attendanceRecords?: AttendanceRecordShape[];
};

export type StudentAttendanceFilters = {
  classGroupId?: string | null;
  from?: string | Date | null;
  scheduledClassId?: string | null;
  search?: string | null;
  sort?: string | null;
  status?: string | null;
  subjectId?: string | null;
  to?: string | Date | null;
};

function teacherLessonWhere(
  teacherId: string,
  scheduledClassId: string,
): Prisma.ScheduledClassWhereInput {
  return {
    id: scheduledClassId,
    OR: [{ teacherId }, { classGroup: { teacherId } }],
  };
}

function lessonRosterInclude() {
  return {
    students: {
      select: {
        id: true,
        fullName: true,
        email: true,
      },
      orderBy: { fullName: "asc" as const },
    },
    classGroup: {
      select: {
        id: true,
        teacherId: true,
        students: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
          orderBy: { fullName: "asc" as const },
        },
      },
    },
    attendanceRecords: true,
  };
}

function rosterForLesson(lesson: ScheduledClassShape) {
  return lesson.classGroup?.students?.length ? lesson.classGroup.students : (lesson.students ?? []);
}

function ensureAttendanceStatus(value: AttendanceInput["status"]) {
  if (value === "PRESENT" || value === "LATE" || value === "ABSENT") {
    return value;
  }
  throw new Error("Invalid attendance status.");
}

function normalizeReason(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function validateAttendanceInput(input: AttendanceInput) {
  const status = ensureAttendanceStatus(input.status);
  const lateMinutes = input.lateMinutes ?? null;
  const reason = normalizeReason(input.reason);

  if (status === AttendanceStatus.LATE && (!lateMinutes || lateMinutes <= 0)) {
    throw new Error("Late minutes must be greater than 0.");
  }

  return {
    status,
    lateMinutes: status === AttendanceStatus.LATE ? lateMinutes : null,
    reason,
  };
}

function isStudentInLesson(lesson: ScheduledClassShape, studentId: string) {
  return rosterForLesson(lesson).some((student) => student.id === studentId);
}

function isWithinLiveWindow(lesson: ScheduledClassShape, now: Date) {
  return now >= lesson.startAt && now <= lesson.endAt;
}

function isWithinCorrectionWindow(lesson: ScheduledClassShape, now: Date) {
  const correctionWindowEnds = new Date(
    lesson.endAt.getTime() + CORRECTION_WINDOW_HOURS * 60 * 60 * 1000,
  );
  return now > lesson.endAt && now <= correctionWindowEnds;
}

function assertCanMarkAttendance(
  lesson: ScheduledClassShape,
  input: AttendanceInput,
  normalized: ReturnType<typeof validateAttendanceInput>,
) {
  if (!isStudentInLesson(lesson, input.studentId)) {
    throw new Error("Student is not enrolled in this lesson.");
  }

  const now = input.now ?? new Date();
  if (isWithinLiveWindow(lesson, now)) {
    return;
  }

  if (isWithinCorrectionWindow(lesson, now)) {
    if (!normalized.reason) {
      throw new Error("A reason is required for post-live attendance correction.");
    }
    return;
  }

  throw new Error("Attendance correction window is closed after 24 hours.");
}

function compactAttendance(record?: AttendanceRecordShape | null) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    scheduledClassId: record.scheduledClassId,
    studentId: record.studentId,
    status: record.status,
    lateMinutes: record.lateMinutes ?? null,
    reason: record.reason ?? null,
    markedAt: record.markedAt ?? null,
  };
}

function statusLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseStudentAttendanceStatus(value: unknown) {
  return value === AttendanceStatus.PRESENT ||
    value === AttendanceStatus.LATE ||
    value === AttendanceStatus.ABSENT
    ? value
    : null;
}

function parseDateBoundary(value: unknown, boundary: "from" | "to") {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (boundary === "from") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }

  return date;
}

function buildStudentAttendanceOrderBy(
  sort: string | null | undefined,
): Prisma.AttendanceRecordOrderByWithRelationInput[] {
  switch (sort) {
    case "markedAtAsc":
      return [{ markedAt: "asc" }, { scheduledClass: { startAt: "asc" } }];
    case "lessonDateAsc":
      return [{ scheduledClass: { startAt: "asc" } }, { markedAt: "asc" }];
    case "lessonDateDesc":
      return [{ scheduledClass: { startAt: "desc" } }, { markedAt: "desc" }];
    case "status":
      return [{ status: "asc" }, { scheduledClass: { startAt: "desc" } }];
    case "subject":
      return [{ scheduledClass: { subject: { name: "asc" } } }, { markedAt: "desc" }];
    default:
      return [{ markedAt: "desc" }, { scheduledClass: { startAt: "desc" } }];
  }
}

function mapStudentAttendanceRecord(
  record: AttendanceRecordShape & { scheduledClass?: ScheduledClassShape | null },
) {
  const lesson = record.scheduledClass;

  return {
    id: record.id,
    lateMinutes: record.lateMinutes ?? null,
    markedAt: record.markedAt ?? null,
    reason: record.reason ?? null,
    scheduledClassId: record.scheduledClassId,
    status: record.status,
    statusLabel: statusLabel(String(record.status)),
    lesson: lesson
      ? {
          detailHref: `/portal/student/schedule/${lesson.id}`,
          endAt: lesson.endAt,
          id: lesson.id,
          startAt: lesson.startAt,
          status: lesson.status ?? null,
          title: lesson.title ?? "Lesson",
        }
      : {
          detailHref: `/portal/student/schedule/${record.scheduledClassId}`,
          endAt: null,
          id: record.scheduledClassId,
          startAt: null,
          status: null,
          title: "Lesson",
        },
    classGroup: lesson?.classGroup?.id
      ? {
          id: lesson.classGroup.id,
          name: lesson.classGroup.name ?? "Class group",
        }
      : null,
    subject: lesson?.subject ? { id: lesson.subject.id, name: lesson.subject.name } : null,
    teacher: lesson?.teacher
      ? { id: lesson.teacher.id, fullName: lesson.teacher.fullName, name: lesson.teacher.fullName }
      : null,
  };
}

function summarizeStudentAttendance(records: AttendanceRecordShape[]) {
  const present = records.filter((record) => record.status === AttendanceStatus.PRESENT).length;
  const late = records.filter((record) => record.status === AttendanceStatus.LATE).length;
  const absent = records.filter((record) => record.status === AttendanceStatus.ABSENT).length;
  const total = records.length;
  const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : null;

  return {
    absent,
    attendanceRate,
    late,
    present,
    total,
  };
}

export async function getTeacherLessonAttendanceRoster(
  teacherId: string,
  scheduledClassId: string,
) {
  const lesson = (await prisma.scheduledClass.findFirst({
    where: teacherLessonWhere(teacherId, scheduledClassId),
    include: lessonRosterInclude(),
  })) as ScheduledClassShape | null;

  if (!lesson) {
    throw new Error("Lesson not found or not assigned to this teacher.");
  }

  const attendanceByStudentId = new Map(
    (lesson.attendanceRecords ?? []).map((record) => [record.studentId, record]),
  );

  return rosterForLesson(lesson).map((student) => ({
    id: student.id,
    fullName: student.fullName,
    email: student.email ?? null,
    attendance: compactAttendance(attendanceByStudentId.get(student.id)),
  }));
}

export async function markLessonAttendanceForTeacher(teacherId: string, input: AttendanceInput) {
  const normalized = validateAttendanceInput(input);
  const lesson = (await prisma.scheduledClass.findFirst({
    where: teacherLessonWhere(teacherId, input.scheduledClassId),
    include: lessonRosterInclude(),
  })) as ScheduledClassShape | null;

  if (!lesson) {
    throw new Error("Lesson not found or not assigned to this teacher.");
  }

  assertCanMarkAttendance(lesson, input, normalized);

  const before = (await prisma.attendanceRecord.findFirst({
    where: {
      ...(input.attendanceId ? { id: input.attendanceId } : {}),
      scheduledClassId: input.scheduledClassId,
      studentId: input.studentId,
    },
  })) as AttendanceRecordShape | null;

  const data = {
    lateMinutes: normalized.lateMinutes,
    markedById: teacherId,
    markedAt: input.now ?? new Date(),
    reason: normalized.reason,
    status: normalized.status,
  };

  const after = (await prisma.attendanceRecord.upsert({
    where: {
      scheduledClassId_studentId: {
        scheduledClassId: input.scheduledClassId,
        studentId: input.studentId,
      },
    },
    create: {
      ...data,
      scheduledClassId: input.scheduledClassId,
      studentId: input.studentId,
    },
    update: data,
  })) as AttendanceRecordShape | undefined;

  const result = after ?? {
    id: input.attendanceId ?? "",
    scheduledClassId: input.scheduledClassId,
    studentId: input.studentId,
    ...data,
  };

  return {
    ...result,
    before: compactAttendance(before),
    after: compactAttendance(result),
  };
}

export async function listAttendanceHistoryForStudent(
  viewer:
    | { role: UserRole; userId: string }
    | { type: "teacher"; teacherId: string }
    | { type: "student"; studentId: string }
    | { type: "parent"; parentId: string },
  studentId: string,
  filters: { classGroupId?: string; termId?: string } = {},
) {
  const viewerRole =
    "role" in viewer
      ? viewer.role
      : viewer.type === "teacher"
        ? UserRole.TEACHER
        : viewer.type === "student"
          ? UserRole.STUDENT
          : UserRole.PARENT;
  const viewerUserId =
    "userId" in viewer
      ? viewer.userId
      : viewer.type === "teacher"
        ? viewer.teacherId
        : viewer.type === "student"
          ? viewer.studentId
          : viewer.parentId;

  if (viewerRole === UserRole.STUDENT && viewerUserId !== studentId) {
    throw new Error("Unauthorized attendance history access.");
  }

  if (viewerRole === UserRole.PARENT) {
    const linkedParent = await prisma.appUser.findFirst({
      where: {
        id: viewerUserId,
        role: UserRole.PARENT,
        children: { some: { id: studentId } },
      },
      select: { id: true },
    });
    if (!linkedParent) {
      throw new Error("Parent is not linked to this child.");
    }
  }

  const scheduledClassWhere: Prisma.ScheduledClassWhereInput = {};
  if (viewerRole === UserRole.TEACHER) {
    scheduledClassWhere.OR = [
      { teacherId: viewerUserId },
      { classGroup: { teacherId: viewerUserId } },
    ];
  }
  if (filters.classGroupId) {
    scheduledClassWhere.classGroupId = filters.classGroupId;
  }

  return prisma.attendanceRecord.findMany({
    where: {
      studentId,
      ...(Object.keys(scheduledClassWhere).length > 0
        ? { scheduledClass: scheduledClassWhere }
        : {}),
    },
    include: {
      scheduledClass: {
        include: {
          classGroup: true,
          subject: true,
        },
      },
    },
    orderBy: { markedAt: "desc" },
  });
}

export async function listAttendanceHistoryForClassGroup(
  teacherId: string,
  classGroupId: string,
  _filters: Record<string, unknown> = {},
) {
  return prisma.attendanceRecord.findMany({
    where: {
      scheduledClass: {
        classGroupId,
        classGroup: { teacherId },
      },
    },
    include: {
      scheduledClass: true,
      student: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { markedAt: "desc" },
  });
}

export async function listStudentAttendance(
  studentId: string,
  filters: StudentAttendanceFilters = {},
) {
  const status = parseStudentAttendanceStatus(filters.status);
  const from = parseDateBoundary(filters.from, "from");
  const to = parseDateBoundary(filters.to, "to");
  const search = filters.search?.trim();
  const scheduledClassWhere: Prisma.ScheduledClassWhereInput = {
    ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(from || to
      ? {
          startAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const where: Prisma.AttendanceRecordWhereInput = {
    studentId,
    ...(status ? { status } : {}),
    ...(filters.scheduledClassId ? { scheduledClassId: filters.scheduledClassId } : {}),
    ...(Object.keys(scheduledClassWhere).length > 0 ? { scheduledClass: scheduledClassWhere } : {}),
    ...(search
      ? {
          OR: [
            { reason: { contains: search, mode: "insensitive" as const } },
            { scheduledClass: { title: { contains: search, mode: "insensitive" as const } } },
            {
              scheduledClass: {
                subject: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
            {
              scheduledClass: {
                classGroup: { name: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  const records = (await prisma.attendanceRecord.findMany({
    where,
    include: {
      scheduledClass: {
        include: {
          classGroup: true,
          subject: true,
          teacher: {
            select: {
              fullName: true,
              id: true,
            },
          },
        },
      },
    },
    orderBy: buildStudentAttendanceOrderBy(filters.sort),
  })) as Array<AttendanceRecordShape & { scheduledClass?: ScheduledClassShape | null }>;

  return {
    records: records.map(mapStudentAttendanceRecord),
    summary: summarizeStudentAttendance(records),
  };
}

export async function listParentChildAttendance(
  parentId: string,
  studentId: string,
  filters: Record<string, unknown> = {},
) {
  const linkedParent = await prisma.appUser.findFirst({
    where: {
      children: { some: { id: studentId } },
      id: parentId,
      role: UserRole.PARENT,
    },
    select: { id: true },
  });

  if (!linkedParent) {
    throw new Error("Parent is not linked to this child.");
  }

  return listStudentAttendance(studentId, filters);
}
