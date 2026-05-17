import { LessonStatus, type MeetingProvider, type Prisma, UserRole } from "@prisma/client";

import {
  canJoinLesson as getLessonJoinState,
  parseLessonStatus,
} from "@/lib/lessons/lesson-status";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEZONE = "Europe/Kiev";

export type StudentScheduleInput = {
  studentId: string;
  from: Date;
  to: Date;
  subjectId?: string;
  status?: LessonStatus | string;
};

export type ParentScheduleInput = {
  parentId: string;
  from: Date;
  to: Date;
  studentId?: string;
  subjectId?: string;
  status?: LessonStatus | string;
};

export type StudentScheduleLesson = {
  id: string;
  title: string;
  description: string | null;
  status: LessonStatus | string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  liveLessonUrl: string | null;
  meetingProvider: MeetingProvider | string;
  googleCalendarEventId: string | null;
  googleMeetSpaceName: string | null;
  meetingUpdatedAt: Date | null;
  subject: { id: string; name: string; slug: string } | null;
  level: { id: string; name: string; slug: string } | null;
  teacher: { id: string; fullName: string; email: string } | null;
  classGroup: { id: string; name: string } | null;
  student?: { id: string; fullName: string; email?: string | null } | null;
  child?: { id: string; fullName: string; email?: string | null } | null;
  cancelReason: string | null;
  rescheduledFromId: string | null;
  materialsCount: number;
  materials: Array<{ id: string; title: string; url: string | null }>;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissionStatus: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
    submissionId: string | null;
    grade: number | null;
  }>;
};

export type JoinState = {
  enabled: boolean;
  href: string | null;
  reason: string | null;
};

type LessonStudent = {
  id: string;
  fullName: string;
  email?: string | null;
};

type LessonRecord = {
  id: string;
  title: string;
  description: string | null;
  status: LessonStatus | string;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  liveLessonUrl?: string | null;
  meetingProvider?: MeetingProvider | string | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingUpdatedAt?: Date | null;
  cancelReason?: string | null;
  rescheduledFromId?: string | null;
  subject?: { id: string; name: string; slug: string } | null;
  teacher?: { id: string; fullName: string; email: string } | null;
  classGroup?: {
    id: string;
    name: string;
    level?: { id: string; name: string; slug: string } | null;
    students?: LessonStudent[];
  } | null;
  students?: LessonStudent[];
  courseMaterials?: Array<{
    id: string;
    title: string;
    fileUrl?: string | null;
    url?: string | null;
  }>;
  assignments?: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissions?: Array<{ id: string; studentId?: string; grade?: number | null }>;
  }>;
  _count?: { courseMaterials?: number };
};

function buildStudentAccessWhere(studentId: string) {
  return [
    { classGroup: { students: { some: { id: studentId } } } },
    { students: { some: { id: studentId } } },
  ];
}

function buildStudentIdsAccessWhere(studentIds: string[]) {
  return [
    { classGroup: { students: { some: { id: { in: studentIds } } } } },
    { students: { some: { id: { in: studentIds } } } },
  ];
}

function buildLessonInclude(studentId?: string, studentIds?: string[]) {
  const submissionsWhere =
    studentIds && studentIds.length > 0
      ? { studentId: { in: studentIds } }
      : studentId
        ? { studentId }
        : undefined;

  return {
    subject: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    teacher: {
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    },
    classGroup: {
      include: {
        level: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
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
    students: {
      select: {
        id: true,
        fullName: true,
        email: true,
      },
      orderBy: { fullName: "asc" as const },
    },
    courseMaterials: {
      select: {
        id: true,
        title: true,
        fileUrl: true,
      },
      orderBy: { createdAt: "desc" as const },
    },
    assignments: {
      include: {
        submissions: {
          ...(submissionsWhere ? { where: submissionsWhere } : {}),
          select: {
            id: true,
            studentId: true,
            grade: true,
          },
        },
      },
      orderBy: { dueDate: "asc" as const },
    },
    _count: {
      select: {
        courseMaterials: true,
      },
    },
  };
}

function firstAccessibleStudent(lesson: LessonRecord, studentIds: string[]) {
  return (
    lesson.classGroup?.students?.find((student) => studentIds.includes(student.id)) ??
    lesson.students?.find((student) => studentIds.includes(student.id)) ??
    null
  );
}

function mapSubmissionStatus(submission?: { id: string; grade?: number | null }) {
  if (!submission) {
    return "NOT_SUBMITTED" as const;
  }
  if (submission.grade !== null && submission.grade !== undefined) {
    return "GRADED" as const;
  }
  return "SUBMITTED" as const;
}

function mapLesson(
  lesson: LessonRecord,
  options: { studentId?: string; studentIds?: string[] } = {},
): StudentScheduleLesson {
  const studentIds = options.studentId ? [options.studentId] : (options.studentIds ?? []);
  const child = studentIds.length > 0 ? firstAccessibleStudent(lesson, studentIds) : null;

  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description ?? null,
    status: lesson.status ?? LessonStatus.SCHEDULED,
    startAt: lesson.startAt,
    endAt: lesson.endAt,
    timezone: lesson.timezone ?? DEFAULT_TIMEZONE,
    liveLessonUrl: lesson.liveLessonUrl ?? null,
    meetingProvider: lesson.meetingProvider ?? "GOOGLE_MEET",
    googleCalendarEventId: lesson.googleCalendarEventId ?? null,
    googleMeetSpaceName: lesson.googleMeetSpaceName ?? null,
    meetingUpdatedAt: lesson.meetingUpdatedAt ?? null,
    subject: lesson.subject ?? null,
    level: lesson.classGroup?.level ?? null,
    teacher: lesson.teacher ?? null,
    classGroup: lesson.classGroup
      ? {
          id: lesson.classGroup.id,
          name: lesson.classGroup.name,
        }
      : null,
    student: child,
    child,
    cancelReason: lesson.cancelReason ?? null,
    rescheduledFromId: lesson.rescheduledFromId ?? null,
    materialsCount: lesson._count?.courseMaterials ?? lesson.courseMaterials?.length ?? 0,
    materials: (lesson.courseMaterials ?? []).map((material) => ({
      id: material.id,
      title: material.title,
      url: material.fileUrl ?? material.url ?? null,
    })),
    assignments: (lesson.assignments ?? []).map((assignment) => {
      const submission =
        assignment.submissions?.find((item) =>
          options.studentId ? item.studentId === options.studentId : true,
        ) ?? assignment.submissions?.[0];

      return {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        submissionStatus: mapSubmissionStatus(submission),
        submissionId: submission?.id ?? null,
        grade: submission?.grade ?? null,
      };
    }),
  };
}

export async function listStudentSchedule(input: StudentScheduleInput) {
  const where: Prisma.ScheduledClassWhereInput = {
    startAt: { gte: input.from, lte: input.to },
    OR: buildStudentAccessWhere(input.studentId),
  };
  if (input.subjectId) {
    where.subjectId = input.subjectId;
  }
  const status = parseLessonStatus(input.status);
  if (status) {
    where.status = status;
  }

  const lessons = await prisma.scheduledClass.findMany({
    where,
    include: buildLessonInclude(input.studentId),
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });

  return (lessons as LessonRecord[]).map((lesson) =>
    mapLesson(lesson, { studentId: input.studentId }),
  );
}

export async function getStudentScheduleLesson(studentId: string, lessonId: string) {
  const lesson = await prisma.scheduledClass.findFirst({
    where: {
      id: lessonId,
      OR: buildStudentAccessWhere(studentId),
    },
    include: buildLessonInclude(studentId),
  });

  return lesson ? mapLesson(lesson as LessonRecord, { studentId }) : null;
}

export async function listParentChildSchedule(input: ParentScheduleInput) {
  const parent = await prisma.appUser.findFirst({
    where: {
      id: input.parentId,
      role: UserRole.PARENT,
      ...(input.studentId ? { children: { some: { id: input.studentId } } } : {}),
    },
    select: { id: true, children: { select: { id: true } } },
  });

  if (!parent) {
    throw new Error("Parent is not linked to this child.");
  }

  const studentIds = input.studentId ? [input.studentId] : parent.children.map((child) => child.id);
  if (studentIds.length === 0) {
    return [];
  }

  const where: Prisma.ScheduledClassWhereInput = {
    startAt: { gte: input.from, lte: input.to },
    OR: buildStudentIdsAccessWhere(studentIds),
  };
  if (input.subjectId) {
    where.subjectId = input.subjectId;
  }
  const status = parseLessonStatus(input.status);
  if (status) {
    where.status = status;
  }

  const lessons = await prisma.scheduledClass.findMany({
    where,
    include: buildLessonInclude(undefined, studentIds),
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });

  return (lessons as LessonRecord[]).map((lesson) => mapLesson(lesson, { studentIds }));
}

export async function getParentScopedStudentScheduleLesson(
  parentId: string,
  studentId: string,
  lessonId: string,
) {
  const parent = await prisma.appUser.findFirst({
    where: {
      id: parentId,
      role: UserRole.PARENT,
      children: { some: { id: studentId } },
    },
    select: { id: true },
  });

  if (!parent) {
    throw new Error("Parent is not linked to this child.");
  }

  const lesson = await prisma.scheduledClass.findFirst({
    where: {
      id: lessonId,
      OR: buildStudentAccessWhere(studentId),
    },
    include: buildLessonInclude(studentId),
  });

  return lesson ? mapLesson(lesson as LessonRecord, { studentId }) : null;
}

export function canJoinLesson(
  lesson: {
    startAt: Date;
    endAt: Date;
    status: LessonStatus | string;
    liveLessonUrl?: string | null;
    meetingProvider?: MeetingProvider | string | null;
  },
  now: Date,
): JoinState {
  return getLessonJoinState(lesson, now);
}
