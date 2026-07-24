import { LessonStatus, type MeetingProvider, type Prisma } from "@prisma/client";

import { canStartLesson } from "@/lib/lessons/lesson-status";
import { prisma } from "@/lib/prisma";
import { newestAttachmentOrderBy } from "@/lib/repositories/attachment-selection";
import { preferredStoredFileHref } from "@/lib/security/storage-links";

const DEFAULT_TIMEZONE = "Africa/Nairobi";

type DisabledAction = {
  disabled: true;
  href: null;
  reason: string;
};

type LinkAction =
  | {
      disabled: false;
      href: string;
      label?: string;
    }
  | DisabledAction;

type StudentRecord = {
  id: string;
  fullName: string;
  email?: string | null;
  isActive?: boolean;
  learningStatus?: string | null;
  studentProgresses?: Array<{ id: string }>;
};

type SubmissionRecord = {
  id: string;
  submittedAt: Date;
  grade: number | null;
  feedback?: string | null;
  student?: StudentRecord | null;
};

type AssignmentRecord = {
  id: string;
  title: string;
  dueDate: Date;
  archivedAt?: Date | null;
  submissions?: SubmissionRecord[];
};

type MaterialRecord = {
  id: string;
  title: string;
  attachments?: Array<{ storageKey: string }>;
  description?: string | null;
  fileUrl?: string | null;
  createdAt?: Date;
};

type LessonRecord = {
  id: string;
  title: string;
  description?: string | null;
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
    status: string;
    teacherId?: string | null;
    students?: StudentRecord[];
  } | null;
  students?: StudentRecord[];
  attendanceRecords?: Array<{
    id: string;
    studentId: string;
    status: string;
    lateMinutes?: number | null;
    reason?: string | null;
    markedAt?: Date | null;
  }>;
  courseMaterials?: MaterialRecord[];
  assignments?: AssignmentRecord[];
};

export type TeacherLessonWorkspace = {
  lesson: {
    id: string;
    title: string;
    description: string | null;
    status: LessonStatus | string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    cancelReason: string | null;
    rescheduledFromId: string | null;
    isRescheduled: boolean;
    liveLessonUrl: string | null;
    meetingProvider: MeetingProvider | string;
    googleCalendarEventId: string | null;
    googleMeetSpaceName: string | null;
    meetingUpdatedAt: Date | null;
    startState: {
      enabled: boolean;
      href: string | null;
      reason: string | null;
    };
  };
  subject: { id: string; name: string; slug: string } | null;
  classGroup: {
    id: string;
    name: string;
    status: string;
    href: string;
  } | null;
  navigationHrefs: {
    backToSchedule: string;
    classDetail: string | DisabledAction;
    submissions: LinkAction;
    progress: LinkAction;
    materials: LinkAction;
    attendance: LinkAction;
  };
  roster: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    learningStatus: string | null;
    submissionStatus: "graded" | "not-submitted" | "pending";
    attendance: {
      id: string;
      status: string;
      lateMinutes: number | null;
      reason: string | null;
      markedAt: Date | null;
    } | null;
  }>;
  materials: Array<{
    id: string;
    title: string;
    description: string | null;
    fileUrl: string | null;
    createdAt: Date | null;
    fileLink: LinkAction;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: Date;
    isArchived: boolean;
    dueState: "active" | "archived" | "due-soon" | "overdue";
    submissionsCount: number;
    pendingSubmissionsCount: number;
    review: LinkAction;
  }>;
  submissions: Array<{
    id: string;
    student: { id: string; fullName: string; email: string | null };
    assignment: { id: string; title: string };
    submittedAt: Date;
    grade: number | null;
    feedback: string | null;
    status: "graded" | "pending";
    review: LinkAction;
  }>;
  gradingSummary: {
    totalSubmissions: number;
    pendingSubmissions: number;
    gradedSubmissions: number;
  };
  progressSummary: {
    count: number;
    disabled: boolean;
    href: string | null;
    label?: string;
    reason: string | null;
  };
  attendanceSummary: {
    disabled: boolean;
    hidden: boolean;
    reason: string | null;
  };
};

function teacherLessonWhere(teacherId: string, lessonId: string): Prisma.ScheduledClassWhereInput {
  return {
    id: lessonId,
    OR: [{ teacherId }, { classGroup: { teacherId } }],
  };
}

function lessonInclude(teacherId: string) {
  return {
    subject: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    classGroup: {
      select: {
        id: true,
        name: true,
        status: true,
        teacherId: true,
        students: {
          select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
            learningStatus: true,
            studentProgresses: {
              where: {
                archivedAt: null,
                teacherId,
              },
              select: { id: true },
            },
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
        learningStatus: true,
        studentProgresses: {
          where: {
            archivedAt: null,
            teacherId,
          },
          select: { id: true },
        },
      },
      orderBy: { fullName: "asc" as const },
    },
    courseMaterials: {
      select: {
        id: true,
        title: true,
        description: true,
        fileUrl: true,
        createdAt: true,
        attachments: {
          select: { storageKey: true },
          orderBy: newestAttachmentOrderBy(),
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" as const },
    },
    assignments: {
      select: {
        id: true,
        title: true,
        dueDate: true,
        archivedAt: true,
        submissions: {
          select: {
            id: true,
            submittedAt: true,
            grade: true,
            feedback: true,
            student: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: { submittedAt: "desc" as const },
        },
      },
      orderBy: { dueDate: "asc" as const },
    },
    attendanceRecords: {
      select: {
        id: true,
        studentId: true,
        status: true,
        lateMinutes: true,
        reason: true,
        markedAt: true,
      },
    },
  };
}

function disabled(reason: string): DisabledAction {
  return {
    disabled: true,
    href: null,
    reason,
  };
}

function safeStartState(lesson: LessonRecord) {
  return canStartLesson(lesson, new Date());
}

function safeFileLink(material: MaterialRecord, href: string | null): LinkAction {
  if (!href) {
    return disabled("Material file link is not available");
  }

  return {
    disabled: false,
    href,
    label: `Open ${material.title}`,
  };
}

function submissionReviewHref(input: {
  assignmentId: string;
  lessonId: string;
  submissionId: string;
}) {
  const params = new URLSearchParams({
    assignmentId: input.assignmentId,
    scheduledClassId: input.lessonId,
  });
  return `/portal/teacher/submissions/${input.submissionId}?${params.toString()}`;
}

function progressHref(lesson: LessonRecord, roster: StudentRecord[]) {
  const params = new URLSearchParams();
  if (roster.length === 1) {
    params.set("studentId", roster[0].id);
  }
  if (lesson.subject?.id) {
    params.set("subjectId", lesson.subject.id);
  }
  const query = params.toString();
  return `/portal/teacher/progress${query ? `?${query}` : ""}`;
}

function submissionStatusForStudent(assignments: AssignmentRecord[], studentId: string) {
  const submissions = assignments.flatMap((assignment) =>
    (assignment.submissions ?? []).filter((submission) => submission.student?.id === studentId),
  );
  if (submissions.some((submission) => submission.grade !== null)) {
    return "graded";
  }
  if (submissions.length > 0) {
    return "pending";
  }
  return "not-submitted";
}

function dueState(assignment: AssignmentRecord, now: Date) {
  if (assignment.archivedAt) {
    return "archived";
  }
  if (assignment.dueDate < now) {
    return "overdue";
  }
  const sevenDaysFromNow = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  if (assignment.dueDate.getTime() <= sevenDaysFromNow) {
    return "due-soon";
  }
  return "active";
}

function mapWorkspace(lesson: LessonRecord): TeacherLessonWorkspace {
  const now = new Date();
  const assignments = lesson.assignments ?? [];
  const rosterSource = lesson.classGroup?.students?.length
    ? lesson.classGroup.students
    : (lesson.students ?? []);
  const submissions = assignments.flatMap((assignment) =>
    (assignment.submissions ?? []).map((submission) => ({
      id: submission.id,
      student: {
        id: submission.student?.id ?? "",
        fullName: submission.student?.fullName ?? "Unknown student",
        email: submission.student?.email ?? null,
      },
      assignment: {
        id: assignment.id,
        title: assignment.title,
      },
      submittedAt: submission.submittedAt,
      grade: submission.grade,
      feedback: submission.feedback ?? null,
      status: submission.grade === null ? ("pending" as const) : ("graded" as const),
      review: {
        disabled: false as const,
        href: submissionReviewHref({
          assignmentId: assignment.id,
          lessonId: lesson.id,
          submissionId: submission.id,
        }),
        label: "Review",
      },
    })),
  );
  const attendanceByStudentId = new Map(
    (lesson.attendanceRecords ?? []).map((record) => [record.studentId, record]),
  );
  const pendingSubmissions = submissions.filter((submission) => submission.status === "pending");
  const classDetailHref = lesson.classGroup
    ? `/portal/teacher/classes/${lesson.classGroup.id}`
    : null;
  const currentProgressNotesCount = rosterSource.reduce(
    (total, student) => total + (student.studentProgresses?.length ?? 0),
    0,
  );
  const lessonProgressHref = progressHref(lesson, rosterSource);

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      description: lesson.description ?? null,
      status: lesson.status ?? LessonStatus.SCHEDULED,
      startAt: lesson.startAt,
      endAt: lesson.endAt,
      timezone: lesson.timezone ?? DEFAULT_TIMEZONE,
      cancelReason: lesson.cancelReason ?? null,
      rescheduledFromId: lesson.rescheduledFromId ?? null,
      isRescheduled:
        lesson.status === LessonStatus.RESCHEDULED ||
        lesson.status === "RESCHEDULED" ||
        Boolean(lesson.rescheduledFromId),
      liveLessonUrl: lesson.liveLessonUrl ?? null,
      meetingProvider: lesson.meetingProvider ?? "GOOGLE_MEET",
      googleCalendarEventId: lesson.googleCalendarEventId ?? null,
      googleMeetSpaceName: lesson.googleMeetSpaceName ?? null,
      meetingUpdatedAt: lesson.meetingUpdatedAt ?? null,
      startState: safeStartState(lesson),
    },
    subject: lesson.subject ?? null,
    classGroup: lesson.classGroup
      ? {
          id: lesson.classGroup.id,
          name: lesson.classGroup.name,
          status: lesson.classGroup.status,
          href: `/portal/teacher/classes/${lesson.classGroup.id}`,
        }
      : null,
    navigationHrefs: {
      backToSchedule: "/portal/teacher/schedule",
      classDetail: classDetailHref ?? disabled("Lesson is not tied to a class group"),
      submissions: {
        disabled: false,
        href: `/portal/teacher/submissions?scheduledClassId=${lesson.id}`,
        label: "Review Submissions",
      },
      progress: {
        disabled: false,
        href: lessonProgressHref,
        label: "Open Progress",
      },
      materials: {
        disabled: false,
        href: `/portal/teacher/materials?scheduledClassId=${lesson.id}`,
        label: "Materials",
      },
      attendance: {
        disabled: false,
        href: `/portal/teacher/lessons/${lesson.id}#attendance`,
        label: "Attendance",
      },
    },
    roster: rosterSource.map((student) => ({
      id: student.id,
      fullName: student.fullName,
      email: student.email ?? null,
      isActive: student.isActive ?? true,
      learningStatus: student.learningStatus ?? null,
      submissionStatus: submissionStatusForStudent(assignments, student.id),
      attendance: attendanceByStudentId.get(student.id)
        ? {
            id: attendanceByStudentId.get(student.id)?.id ?? "",
            status: attendanceByStudentId.get(student.id)?.status ?? "",
            lateMinutes: attendanceByStudentId.get(student.id)?.lateMinutes ?? null,
            reason: attendanceByStudentId.get(student.id)?.reason ?? null,
            markedAt: attendanceByStudentId.get(student.id)?.markedAt ?? null,
          }
        : null,
    })),
    materials: (lesson.courseMaterials ?? []).map((material) => {
      const fileHref = preferredStoredFileHref(
        material.attachments?.[0]?.storageKey,
        material.fileUrl,
      );
      return {
        id: material.id,
        title: material.title,
        description: material.description ?? null,
        fileUrl: fileHref,
        createdAt: material.createdAt ?? null,
        fileLink: safeFileLink(material, fileHref),
      };
    }),
    assignments: assignments.map((assignment) => {
      const assignmentSubmissions = assignment.submissions ?? [];
      return {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        isArchived: Boolean(assignment.archivedAt),
        dueState: dueState(assignment, now),
        submissionsCount: assignmentSubmissions.length,
        pendingSubmissionsCount: assignmentSubmissions.filter(
          (submission) => submission.grade === null,
        ).length,
        review: {
          disabled: false,
          href: `/portal/teacher/submissions?assignmentId=${assignment.id}`,
          label: "Review assignment work",
        },
      };
    }),
    submissions,
    gradingSummary: {
      totalSubmissions: submissions.length,
      pendingSubmissions: pendingSubmissions.length,
      gradedSubmissions: submissions.length - pendingSubmissions.length,
    },
    progressSummary: {
      count: currentProgressNotesCount,
      disabled: false,
      href: lessonProgressHref,
      label: "Open Progress",
      reason:
        currentProgressNotesCount > 0
          ? null
          : "No current progress notes for this lesson roster yet.",
    },
    attendanceSummary: {
      disabled: false,
      hidden: false,
      reason: null,
    },
  };
}

export async function getTeacherLessonWorkspace(
  teacherId: string,
  lessonId: string,
): Promise<TeacherLessonWorkspace | null> {
  const lesson = await prisma.scheduledClass.findFirst({
    where: teacherLessonWhere(teacherId, lessonId),
    include: lessonInclude(teacherId),
  });

  return lesson ? mapWorkspace(lesson as LessonRecord) : null;
}
