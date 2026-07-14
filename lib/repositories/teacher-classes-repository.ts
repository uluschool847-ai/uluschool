import { type ClassGroupStatus, LessonStatus, type Prisma } from "@prisma/client";

import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { prisma } from "@/lib/prisma";
import { preferredStoredFileHref } from "@/lib/security/storage-links";

type SortKey = "name" | "nextLesson" | "pendingSubmissions" | "rosterSize";

export type TeacherClassGroupFilters = {
  levelId?: string;
  q?: string;
  sort?: SortKey;
  status?: ClassGroupStatus;
  subjectId?: string;
};

type StudentRecord = {
  id: string;
  fullName: string;
  email?: string | null;
  isActive?: boolean;
  learningStatus?: string | null;
};

type AssignmentRecord = {
  id: string;
  title?: string;
  dueDate?: Date;
  archivedAt?: Date | null;
  submissions?: Array<{
    id: string;
    grade: number | null;
    submittedAt?: Date;
    student?: StudentRecord;
  }>;
};

type LessonRecord = {
  id: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  status?: LessonStatus | string | null;
  liveLessonUrl?: string | null;
  subject?: SubjectRecord | null;
  students?: StudentRecord[];
  assignments?: AssignmentRecord[];
  courseMaterials?: MaterialRecord[];
};

type SubjectRecord = { id: string; name: string; slug: string };
type LevelRecord = { id: string; name: string };
type MaterialRecord = {
  id: string;
  title: string;
  attachments?: Array<{ storageKey: string }>;
  fileUrl?: string | null;
  fileHref?: string | null;
};

type ClassGroupRecord = {
  id: string;
  name: string;
  status: ClassGroupStatus | string;
  capacity?: number | null;
  subject?: SubjectRecord | null;
  level?: LevelRecord | null;
  students?: StudentRecord[];
  lessons?: LessonRecord[];
  assignments?: AssignmentRecord[];
  materials?: MaterialRecord[];
  pendingSubmissions?: Array<{
    id: string;
    submittedAt: Date;
    student: StudentRecord;
    assignment: { id: string; title: string };
  }>;
};

export type TeacherClassGroupListItem = {
  id: string;
  name: string;
  subject: SubjectRecord | null;
  level: LevelRecord | null;
  status: ClassGroupStatus | string;
  capacity: number | null;
  rosterCount: number;
  activeRosterCount: number;
  nextLesson: {
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    status: LessonStatus | string;
  } | null;
  upcomingLessonsCount: number;
  activeAssignmentsCount: number;
  pendingSubmissionsCount: number;
  openHref: string;
  scheduleHref: string;
  nextLessonHref: string | null;
};

export type TeacherClassGroupDetail = {
  id: string;
  name: string;
  subject: SubjectRecord | null;
  level: LevelRecord | null;
  status: ClassGroupStatus | string;
  capacity: number | null;
  roster: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    learningStatus: string | null;
  }>;
  upcomingLessons: Array<{
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    status: LessonStatus | string;
    detailHref: string;
    startHref: string | null;
  }>;
  pastLessons: Array<{
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    status: LessonStatus | string;
    detailHref: string;
  }>;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissionsCount: number;
    pendingSubmissionsCount: number;
  }>;
  materials: Array<{ id: string; title: string; fileUrl: string | null; fileHref: string | null }>;
  pendingSubmissions: Array<{
    id: string;
    student: { id: string; fullName: string; email: string | null };
    assignment: { id: string; title: string };
    submittedAt: Date;
    reviewHref: string;
  }>;
};

function classGroupWhere(
  teacherId: string,
  filters: TeacherClassGroupFilters = {},
): Prisma.ClassGroupWhereInput {
  return {
    teacherId,
    ...(filters.q
      ? {
          name: {
            contains: filters.q,
            mode: "insensitive",
          },
        }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.levelId ? { levelId: filters.levelId } : {}),
  };
}

function groupSelect() {
  return {
    id: true,
    name: true,
    status: true,
    capacity: true,
    subject: { select: { id: true, name: true, slug: true } },
    level: { select: { id: true, name: true } },
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
    lessons: {
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        status: true,
        liveLessonUrl: true,
        courseMaterials: {
          select: {
            id: true,
            title: true,
            fileUrl: true,
            attachments: {
              select: { storageKey: true },
              orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
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
                grade: true,
                submittedAt: true,
                student: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
          orderBy: { dueDate: "asc" as const },
        },
      },
      orderBy: { startAt: "asc" as const },
    },
  };
}

function directLegacySelect() {
  return {
    id: true,
    title: true,
    startAt: true,
    endAt: true,
    status: true,
    subject: { select: { id: true, name: true, slug: true } },
    students: {
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
      },
      orderBy: { fullName: "asc" as const },
    },
    assignments: {
      select: {
        id: true,
        title: true,
        dueDate: true,
        archivedAt: true,
        submissions: { select: { id: true, grade: true } },
      },
    },
  };
}

function isFutureActiveLesson(lesson: LessonRecord, now: Date) {
  return (
    lesson.startAt >= now &&
    lesson.status !== LessonStatus.CANCELLED &&
    lesson.status !== LessonStatus.COMPLETED
  );
}

function safeStartHref(url?: string | null) {
  const validation = validateLiveLessonUrl(url ?? null, "MANUAL_URL", { required: false });
  return validation.ok ? validation.url : null;
}

function activeAssignments(assignments: AssignmentRecord[], now: Date) {
  return assignments.filter(
    (assignment) => !assignment.archivedAt && (!assignment.dueDate || assignment.dueDate >= now),
  );
}

function allAssignments(group: ClassGroupRecord) {
  const assignmentsById = new Map<string, AssignmentRecord>();
  for (const assignment of group.assignments ?? []) {
    assignmentsById.set(assignment.id, assignment);
  }
  for (const lesson of group.lessons ?? []) {
    for (const assignment of lesson.assignments ?? []) {
      assignmentsById.set(assignment.id, assignment);
    }
  }
  return Array.from(assignmentsById.values());
}

function pendingSubmissionCount(assignments: AssignmentRecord[]) {
  return assignments.reduce(
    (total, assignment) =>
      total +
      (assignment.submissions ?? []).filter((submission) => submission.grade === null).length,
    0,
  );
}

function mapListGroup(group: ClassGroupRecord, now: Date): TeacherClassGroupListItem {
  const roster = group.students ?? [];
  const upcomingLessons = (group.lessons ?? [])
    .filter((lesson) => isFutureActiveLesson(lesson, now))
    .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
  const nextLesson = upcomingLessons[0] ?? null;
  const active = activeAssignments(allAssignments(group), now);

  return {
    id: group.id,
    name: group.name,
    subject: group.subject ?? null,
    level: group.level ?? null,
    status: group.status,
    capacity: group.capacity ?? null,
    rosterCount: roster.length,
    activeRosterCount: roster.filter((student) => student.isActive !== false).length,
    nextLesson: nextLesson
      ? {
          id: nextLesson.id,
          title: nextLesson.title,
          startAt: nextLesson.startAt,
          endAt: nextLesson.endAt,
          status: nextLesson.status ?? LessonStatus.SCHEDULED,
        }
      : null,
    upcomingLessonsCount: upcomingLessons.length,
    activeAssignmentsCount: active.length,
    pendingSubmissionsCount: pendingSubmissionCount(active),
    openHref: `/portal/teacher/classes/${group.id}`,
    scheduleHref: `/portal/teacher/schedule?classGroupId=${group.id}`,
    nextLessonHref: nextLesson ? `/portal/teacher/lessons/${nextLesson.id}` : null,
  };
}

function mapLegacyLesson(lesson: LessonRecord, now: Date): TeacherClassGroupListItem {
  const assignments = activeAssignments(lesson.assignments ?? [], now);
  const roster = lesson.students ?? [];

  return {
    id: lesson.id,
    name: lesson.title,
    subject: lesson.subject ?? null,
    level: null,
    status: lesson.status ?? LessonStatus.SCHEDULED,
    capacity: null,
    rosterCount: roster.length,
    activeRosterCount: roster.filter((student) => student.isActive !== false).length,
    nextLesson: isFutureActiveLesson(lesson, now)
      ? {
          id: lesson.id,
          title: lesson.title,
          startAt: lesson.startAt,
          endAt: lesson.endAt,
          status: lesson.status ?? LessonStatus.SCHEDULED,
        }
      : null,
    upcomingLessonsCount: isFutureActiveLesson(lesson, now) ? 1 : 0,
    activeAssignmentsCount: assignments.length,
    pendingSubmissionsCount: pendingSubmissionCount(assignments),
    openHref: `/portal/teacher/lessons/${lesson.id}`,
    scheduleHref: "/portal/teacher/schedule",
    nextLessonHref: isFutureActiveLesson(lesson, now)
      ? `/portal/teacher/lessons/${lesson.id}`
      : null,
  };
}

function sortGroupItems(items: TeacherClassGroupListItem[], sort?: SortKey) {
  if (!sort || sort === "name") {
    return items;
  }

  return [...items].sort((left, right) => {
    if (sort === "nextLesson") {
      const leftTime = left.nextLesson?.startAt.getTime() ?? Number.POSITIVE_INFINITY;
      const rightTime = right.nextLesson?.startAt.getTime() ?? Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.name.localeCompare(right.name);
    }
    if (sort === "pendingSubmissions") {
      return (
        right.pendingSubmissionsCount - left.pendingSubmissionsCount ||
        left.name.localeCompare(right.name)
      );
    }
    if (sort === "rosterSize") {
      return right.rosterCount - left.rosterCount || left.name.localeCompare(right.name);
    }
    return left.name.localeCompare(right.name);
  });
}

export async function listTeacherClassGroups(
  teacherId: string,
  filters: TeacherClassGroupFilters = {},
): Promise<TeacherClassGroupListItem[]> {
  const now = new Date();
  const groups = (await prisma.classGroup.findMany({
    where: classGroupWhere(teacherId, filters),
    select: groupSelect(),
    orderBy: { name: "asc" },
  })) as ClassGroupRecord[];
  const legacyLessons = (await prisma.scheduledClass.findMany({
    where: {
      teacherId,
      classGroupId: null,
    },
    select: directLegacySelect(),
    orderBy: { startAt: "asc" },
  })) as LessonRecord[];

  return [
    ...sortGroupItems(
      groups.map((group) => mapListGroup(group, now)),
      filters.sort,
    ),
    ...legacyLessons.map((lesson) => mapLegacyLesson(lesson, now)),
  ];
}

function mapRoster(students: StudentRecord[] = []) {
  return students.map((student) => ({
    id: student.id,
    fullName: student.fullName,
    email: student.email ?? null,
    isActive: student.isActive ?? true,
    learningStatus: student.learningStatus ?? null,
  }));
}

function mapDetail(group: ClassGroupRecord, now: Date): TeacherClassGroupDetail {
  const lessons = [...(group.lessons ?? [])].sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime(),
  );
  const upcomingLessons = lessons
    .filter((lesson) => isFutureActiveLesson(lesson, now))
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description ?? null,
      startAt: lesson.startAt,
      endAt: lesson.endAt,
      status: lesson.status ?? LessonStatus.SCHEDULED,
      detailHref: `/portal/teacher/lessons/${lesson.id}`,
      startHref: safeStartHref(lesson.liveLessonUrl),
    }));
  const pastLessons = lessons
    .filter((lesson) => !isFutureActiveLesson(lesson, now))
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description ?? null,
      startAt: lesson.startAt,
      endAt: lesson.endAt,
      status: lesson.status ?? LessonStatus.SCHEDULED,
      detailHref: `/portal/teacher/lessons/${lesson.id}`,
    }));
  const assignments = allAssignments(group).map((assignment) => ({
    id: assignment.id,
    title: assignment.title ?? "Assignment",
    dueDate: assignment.dueDate ?? new Date(0),
    submissionsCount: assignment.submissions?.length ?? 0,
    pendingSubmissionsCount:
      assignment.submissions?.filter((submission) => submission.grade === null).length ?? 0,
  }));
  const materialsById = new Map<string, MaterialRecord>();
  for (const material of group.materials ?? []) {
    materialsById.set(material.id, material);
  }
  for (const lesson of lessons) {
    for (const material of lesson.courseMaterials ?? []) {
      materialsById.set(material.id, material);
    }
  }
  const pendingSubmissions = (group.pendingSubmissions ?? []).map((submission) => ({
    id: submission.id,
    student: {
      id: submission.student.id,
      fullName: submission.student.fullName,
      email: submission.student.email ?? null,
    },
    assignment: submission.assignment,
    submittedAt: submission.submittedAt,
    reviewHref: `/portal/teacher/submissions/${submission.id}`,
  }));
  for (const assignment of allAssignments(group)) {
    for (const submission of assignment.submissions ?? []) {
      if (submission.grade !== null || !submission.submittedAt || !submission.student) continue;
      pendingSubmissions.push({
        id: submission.id,
        student: {
          id: submission.student.id,
          fullName: submission.student.fullName,
          email: submission.student.email ?? null,
        },
        assignment: { id: assignment.id, title: assignment.title ?? "Assignment" },
        submittedAt: submission.submittedAt,
        reviewHref: `/portal/teacher/submissions/${submission.id}`,
      });
    }
  }

  return {
    id: group.id,
    name: group.name,
    subject: group.subject ?? null,
    level: group.level ?? null,
    status: group.status,
    capacity: group.capacity ?? null,
    roster: mapRoster(group.students),
    upcomingLessons,
    pastLessons,
    assignments,
    materials: Array.from(materialsById.values()).map((material) => {
      const fileHref = preferredStoredFileHref(
        material.attachments?.[0]?.storageKey,
        material.fileHref ?? material.fileUrl,
      );
      return {
        id: material.id,
        title: material.title,
        fileUrl: fileHref,
        fileHref,
      };
    }),
    pendingSubmissions,
  };
}

export async function getTeacherClassGroupDetail(
  teacherId: string,
  classGroupId: string,
): Promise<TeacherClassGroupDetail | null> {
  const group = (await prisma.classGroup.findFirst({
    where: {
      id: classGroupId,
      teacherId,
    },
    select: groupSelect(),
  })) as ClassGroupRecord | null;

  return group ? mapDetail(group, new Date()) : null;
}
