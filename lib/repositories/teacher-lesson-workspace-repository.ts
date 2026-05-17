import { LessonStatus, type MeetingProvider, type Prisma } from "@prisma/client";

import { canStartLesson } from "@/lib/lessons/lesson-status";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEZONE = "Europe/Kiev";

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
    submissions: DisabledAction;
    progress: DisabledAction;
    materials: DisabledAction;
    attendance: DisabledAction;
  };
  roster: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    learningStatus: string | null;
    submissionStatus: "graded" | "not-submitted" | "pending";
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
    review: DisabledAction;
  }>;
  submissions: Array<{
    id: string;
    student: { id: string; fullName: string; email: string | null };
    assignment: { id: string; title: string };
    submittedAt: Date;
    grade: number | null;
    feedback: string | null;
    status: "graded" | "pending";
    review: DisabledAction;
  }>;
  gradingSummary: {
    totalSubmissions: number;
    pendingSubmissions: number;
    gradedSubmissions: number;
  };
  progressSummary: DisabledAction & { count: number };
  attendanceSummary: {
    disabled: true;
    hidden: true;
    reason: string;
  };
};

function teacherLessonWhere(teacherId: string, lessonId: string): Prisma.ScheduledClassWhereInput {
  return {
    id: lessonId,
    OR: [{ teacherId }, { classGroup: { teacherId } }],
  };
}

function lessonInclude() {
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

function safeFileLink(material: MaterialRecord): LinkAction {
  const href = material.fileUrl ?? null;
  if (!href || href.trim().startsWith("javascript:")) {
    return disabled("Material file link is not available");
  }

  return {
    disabled: false,
    href,
    label: `Open ${material.title}`,
  };
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
      review: disabled("Teacher submission detail route is not implemented"),
    })),
  );
  const pendingSubmissions = submissions.filter((submission) => submission.status === "pending");
  const classDetailHref = lesson.classGroup
    ? `/portal/teacher/classes/${lesson.classGroup.id}`
    : null;

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
      submissions: disabled("Teacher submissions route is not implemented"),
      progress: disabled("Teacher progress route is not implemented"),
      materials: disabled("Teacher materials route is not implemented"),
      attendance: disabled("Attendance module is not implemented"),
    },
    roster: rosterSource.map((student) => ({
      id: student.id,
      fullName: student.fullName,
      email: student.email ?? null,
      isActive: student.isActive ?? true,
      learningStatus: student.learningStatus ?? null,
      submissionStatus: submissionStatusForStudent(assignments, student.id),
    })),
    materials: (lesson.courseMaterials ?? []).map((material) => ({
      id: material.id,
      title: material.title,
      description: material.description ?? null,
      fileUrl: material.fileUrl ?? null,
      createdAt: material.createdAt ?? null,
      fileLink: safeFileLink(material),
    })),
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
        review: disabled("Teacher submissions route is not implemented"),
      };
    }),
    submissions,
    gradingSummary: {
      totalSubmissions: submissions.length,
      pendingSubmissions: pendingSubmissions.length,
      gradedSubmissions: submissions.length - pendingSubmissions.length,
    },
    progressSummary: {
      ...disabled("Teacher progress route is not implemented"),
      count: 0,
    },
    attendanceSummary: {
      disabled: true,
      hidden: true,
      reason: "Attendance module is not implemented",
    },
  };
}

export async function getTeacherLessonWorkspace(
  teacherId: string,
  lessonId: string,
): Promise<TeacherLessonWorkspace | null> {
  const lesson = await prisma.scheduledClass.findFirst({
    where: teacherLessonWhere(teacherId, lessonId),
    include: lessonInclude(),
  });

  return lesson ? mapWorkspace(lesson as LessonRecord) : null;
}
