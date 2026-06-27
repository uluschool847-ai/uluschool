import { LessonStatus, type MeetingProvider, type Prisma } from "@prisma/client";

import {
  canStartLesson as getLessonStartState,
  parseLessonStatus,
} from "@/lib/lessons/lesson-status";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEZONE = "Africa/Nairobi";

export type TeacherScheduleInput = {
  teacherId: string;
  from: Date;
  to: Date;
  classGroupId?: string;
  subjectId?: string;
  status?: LessonStatus | string;
};

export type TeacherScheduleLesson = {
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
  classGroup: { id: string; name: string } | null;
  cancelReason: string | null;
  rescheduledFromId: string | null;
  studentCount: number;
  rosterPreview: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
  }>;
  materialsCount: number;
  materials: Array<{ id: string; title: string; fileUrl: string | null }>;
  assignmentsCount: number;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissionCount: number;
    pendingSubmissionCount: number;
  }>;
  pendingSubmissionsCount: number;
  submissionsSummary: {
    total: number;
    pending: number;
    graded: number;
  };
  progressHref: string;
};

export type TeacherScheduleFilterOptions = {
  classGroups: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
};

export type StartState = {
  enabled: boolean;
  href: string | null;
  reason: string | null;
};

type RosterStudent = {
  id: string;
  fullName: string;
  email?: string | null;
  isActive?: boolean;
};

type TeacherLessonRecord = {
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
  classGroup?: {
    id: string;
    name: string;
    students?: RosterStudent[];
  } | null;
  students?: RosterStudent[];
  courseMaterials?: Array<{ id: string; title: string; fileUrl?: string | null }>;
  assignments?: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissions?: Array<{ id: string; grade?: number | null }>;
  }>;
  _count?: {
    assignments?: number;
    courseMaterials?: number;
  };
};

function buildTeacherAccessWhere(teacherId: string) {
  return [{ teacherId }, { classGroup: { teacherId } }];
}

function buildLessonInclude() {
  return {
    subject: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    classGroup: {
      include: {
        students: {
          select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
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
        isActive: true,
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
          select: {
            id: true,
            grade: true,
          },
        },
      },
      orderBy: { dueDate: "asc" as const },
    },
    _count: {
      select: {
        assignments: true,
        courseMaterials: true,
      },
    },
  };
}

function mapRoster(lesson: TeacherLessonRecord) {
  return (
    lesson.classGroup?.students?.length ? lesson.classGroup.students : (lesson.students ?? [])
  )
    .map((student) => ({
      id: student.id,
      fullName: student.fullName,
      email: student.email ?? null,
      isActive: student.isActive ?? true,
    }))
    .sort((first, second) => first.fullName.localeCompare(second.fullName));
}

function mapLesson(lesson: TeacherLessonRecord): TeacherScheduleLesson {
  const rosterPreview = mapRoster(lesson);
  const assignments = (lesson.assignments ?? []).map((assignment) => {
    const submissionCount = assignment.submissions?.length ?? 0;
    const pendingSubmissionCount =
      assignment.submissions?.filter((submission) => submission.grade === null).length ?? 0;

    return {
      id: assignment.id,
      title: assignment.title,
      dueDate: assignment.dueDate,
      submissionCount,
      pendingSubmissionCount,
    };
  });
  const totalSubmissions = assignments.reduce(
    (total, assignment) => total + assignment.submissionCount,
    0,
  );
  const pendingSubmissionsCount = assignments.reduce(
    (total, assignment) => total + assignment.pendingSubmissionCount,
    0,
  );

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
    classGroup: lesson.classGroup
      ? {
          id: lesson.classGroup.id,
          name: lesson.classGroup.name,
        }
      : null,
    cancelReason: lesson.cancelReason ?? null,
    rescheduledFromId: lesson.rescheduledFromId ?? null,
    studentCount: rosterPreview.length,
    rosterPreview,
    materialsCount: lesson._count?.courseMaterials ?? lesson.courseMaterials?.length ?? 0,
    materials: (lesson.courseMaterials ?? []).map((material) => ({
      id: material.id,
      title: material.title,
      fileUrl: material.fileUrl ?? null,
    })),
    assignmentsCount: lesson._count?.assignments ?? lesson.assignments?.length ?? 0,
    assignments,
    pendingSubmissionsCount,
    submissionsSummary: {
      total: totalSubmissions,
      pending: pendingSubmissionsCount,
      graded: totalSubmissions - pendingSubmissionsCount,
    },
    progressHref: `/portal/teacher/progress?lessonId=${lesson.id}`,
  };
}

function normalizeTeacherScheduleInput(
  input: TeacherScheduleInput | string,
  filters: Partial<Omit<TeacherScheduleInput, "teacherId">> = {},
): TeacherScheduleInput {
  if (typeof input !== "string") {
    return input;
  }

  return {
    teacherId: input,
    from: filters.from ?? new Date("2000-01-01T00:00:00.000Z"),
    to: filters.to ?? new Date("2100-01-01T00:00:00.000Z"),
    classGroupId: filters.classGroupId,
    subjectId: filters.subjectId,
    status: filters.status,
  };
}

export async function listTeacherSchedule(
  input: TeacherScheduleInput | string,
  filters: Partial<Omit<TeacherScheduleInput, "teacherId">> = {},
) {
  const scheduleInput = normalizeTeacherScheduleInput(input, filters);
  const where: Prisma.ScheduledClassWhereInput = {
    startAt: { gte: scheduleInput.from, lte: scheduleInput.to },
    OR: buildTeacherAccessWhere(scheduleInput.teacherId),
  };
  if (scheduleInput.classGroupId) {
    where.classGroupId = scheduleInput.classGroupId;
  }
  if (scheduleInput.subjectId) {
    where.subjectId = scheduleInput.subjectId;
  }
  const status = parseLessonStatus(scheduleInput.status);
  if (status) {
    where.status = status;
  }

  const lessons = await prisma.scheduledClass.findMany({
    where,
    include: buildLessonInclude(),
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });

  return (lessons as TeacherLessonRecord[]).map(mapLesson);
}

export async function getTeacherScheduleFilterOptions(
  teacherId: string,
): Promise<TeacherScheduleFilterOptions> {
  const [classGroups, subjects] = await Promise.all([
    prisma.classGroup.findMany({
      where: { teacherId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.subject.findMany({
      where: {
        OR: [
          { classGroups: { some: { teacherId } } },
          {
            scheduledClasses: {
              some: {
                OR: buildTeacherAccessWhere(teacherId),
              },
            },
          },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { classGroups, subjects };
}

export function canStartLesson(
  lesson: {
    startAt: Date;
    endAt: Date;
    status: LessonStatus | string;
    liveLessonUrl?: string | null;
    meetingProvider?: MeetingProvider | string | null;
  },
  now: Date,
): StartState {
  return getLessonStartState(lesson, now);
}
