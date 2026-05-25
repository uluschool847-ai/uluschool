import { type PerformanceLevel, type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PERFORMANCE_LEVELS = ["EXCELLENT", "GOOD", "STRUGGLING"] as const;
const PROGRESS_NOTE_MAX_LENGTH = 2000;

export type ProgressPerformanceLevel = (typeof PERFORMANCE_LEVELS)[number];
export type ProgressStatusFilter = "active" | "archived" | "all";

export type ProgressNoteViewModel = {
  id: string;
  studentId: string;
  teacherId: string;
  subjectId: string;
  content: string;
  teacherNotes: string;
  performanceLevel: ProgressPerformanceLevel;
  gradeLevel: ProgressPerformanceLevel;
  recordedAt: string;
  updatedAt: string;
  archivedAt: string | null;
  subject: { id: string; name: string } | null;
  teacher: { id: string; fullName: string; name: string } | null;
  teacherName: string;
  statusLabel: "Active" | "Archived";
  canEdit: boolean;
};

type ProgressNoteRecord = {
  id: string;
  studentId: string;
  teacherId: string;
  subjectId: string;
  teacherNotes: string;
  gradeLevel: PerformanceLevel | string;
  recordedAt: Date;
  updatedAt?: Date | null;
  archivedAt?: Date | null;
  subject?: { id: string; name: string } | null;
  student?: { id: string; fullName: string; email: string } | null;
  teacher?: { id: string; fullName: string } | null;
};

export type CreateProgressNoteForTeacherInput = {
  teacherId: string;
  submittedTeacherId?: string | null;
  studentId: string;
  subjectId: string;
  content: string;
  performanceLevel: ProgressPerformanceLevel;
};

export type UpdateProgressNoteForTeacherInput = {
  content: string;
  performanceLevel: ProgressPerformanceLevel;
};

export type ProgressListFilters = {
  performanceLevel?: ProgressPerformanceLevel | string | null;
  search?: string | null;
  sort?: string | null;
  status?: ProgressStatusFilter | string;
  subjectId?: string | null;
};

export type TeacherProgressListFilters = ProgressListFilters & {
  performanceLevel?: ProgressPerformanceLevel | string | null;
  search?: string | null;
  sort?: string | null;
  studentId?: string | null;
};

export type TeacherProgressListRow = {
  id: string;
  student: {
    id: string;
    name: string;
    email: string;
  };
  subject: {
    id: string;
    name: string;
  } | null;
  performanceLevel: ProgressPerformanceLevel;
  contentPreview: string;
  recordedAt: string;
  updatedAt: string;
  archivedAt: string | null;
  statusLabel: "Active" | "Archived";
  href: string;
  studentProgressHref: string;
};

export type TeacherStudentProgressListItem = {
  id: string;
  fullName: string;
  email: string;
  learningStatus: string | null;
  href: string;
  ownershipPaths: Array<"DIRECT_LESSON" | "CLASS_GROUP">;
};

function validateId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function validateContent(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Content is required");
  }
  const content = value.trim();
  if (content.length > PROGRESS_NOTE_MAX_LENGTH) {
    throw new Error("Content must be 2000 characters or less");
  }
  return content;
}

function validatePerformanceLevel(value: unknown): ProgressPerformanceLevel {
  if (
    typeof value !== "string" ||
    !PERFORMANCE_LEVELS.includes(value as ProgressPerformanceLevel)
  ) {
    throw new Error("Performance level is invalid");
  }
  return value as ProgressPerformanceLevel;
}

function normalizeStatus(status?: string | null): ProgressStatusFilter {
  return status === "archived" || status === "all" ? status : "active";
}

function progressArchivedWhere(status?: string | null) {
  const normalized = normalizeStatus(status);
  if (normalized === "archived") return { archivedAt: { not: null } };
  if (normalized === "all") return {};
  return { archivedAt: null };
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapProgressNote(note: ProgressNoteRecord): ProgressNoteViewModel {
  const performanceLevel = validatePerformanceLevel(note.gradeLevel);
  return {
    id: note.id,
    studentId: note.studentId,
    teacherId: note.teacherId,
    subjectId: note.subjectId,
    content: note.teacherNotes,
    teacherNotes: note.teacherNotes,
    performanceLevel,
    gradeLevel: performanceLevel,
    recordedAt: serializeDate(note.recordedAt) ?? new Date(0).toISOString(),
    updatedAt: serializeDate(note.updatedAt ?? note.recordedAt) ?? new Date(0).toISOString(),
    archivedAt: serializeDate(note.archivedAt),
    subject: note.subject ? { id: note.subject.id, name: note.subject.name } : null,
    teacher: note.teacher
      ? { id: note.teacher.id, fullName: note.teacher.fullName, name: note.teacher.fullName }
      : null,
    teacherName: note.teacher?.fullName ?? "Teacher",
    statusLabel: note.archivedAt ? "Archived" : "Active",
    canEdit: !note.archivedAt,
  };
}

function contentPreview(content: string) {
  const normalized = content.trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function normalizePerformanceLevel(value?: string | null) {
  return PERFORMANCE_LEVELS.includes(value as ProgressPerformanceLevel)
    ? (value as ProgressPerformanceLevel)
    : undefined;
}

function progressSortOrder(sort?: string | null): Prisma.StudentProgressOrderByWithRelationInput[] {
  switch (sort) {
    case "recordedAtAsc":
      return [{ recordedAt: "asc" }];
    case "studentName":
      return [{ student: { fullName: "asc" } }, { recordedAt: "desc" }];
    case "teacher":
      return [{ teacher: { fullName: "asc" } }, { recordedAt: "desc" }];
    case "subject":
      return [{ subject: { name: "asc" } }, { recordedAt: "desc" }];
    case "performanceLevel":
      return [{ gradeLevel: "asc" }, { recordedAt: "desc" }];
    default:
      return [{ recordedAt: "desc" }];
  }
}

function mapTeacherProgressRow(note: ProgressNoteRecord): TeacherProgressListRow {
  const performanceLevel = validatePerformanceLevel(note.gradeLevel);
  const student = note.student ?? {
    email: "",
    fullName: "Student",
    id: note.studentId,
  };
  const studentProgressHref = `/portal/teacher/students/${student.id}/progress`;

  return {
    id: note.id,
    student: {
      email: student.email,
      id: student.id,
      name: student.fullName,
    },
    subject: note.subject ? { id: note.subject.id, name: note.subject.name } : null,
    performanceLevel,
    contentPreview: contentPreview(note.teacherNotes),
    recordedAt: serializeDate(note.recordedAt) ?? new Date(0).toISOString(),
    updatedAt: serializeDate(note.updatedAt ?? note.recordedAt) ?? new Date(0).toISOString(),
    archivedAt: serializeDate(note.archivedAt),
    statusLabel: note.archivedAt ? "Archived" : "Active",
    href: studentProgressHref,
    studentProgressHref,
  };
}

function buildTeacherStudentLessonScope(teacherId: string, studentId: string) {
  return {
    OR: [
      {
        teacherId,
        students: { some: { id: studentId } },
      },
      {
        classGroup: {
          teacherId,
          students: { some: { id: studentId } },
        },
      },
    ],
  } satisfies Prisma.ScheduledClassWhereInput;
}

function buildAssignedStudentWhere(teacherId: string): Prisma.AppUserWhereInput {
  return {
    role: UserRole.STUDENT,
    OR: [
      { enrolledClasses: { some: { teacherId } } },
      { enrolledClasses: { some: { classGroup: { teacherId } } } },
      { enrolledClassGroups: { some: { teacherId } } },
    ],
  };
}

async function assertSubjectExists(subjectId: string) {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subject is required");
  }
}

export async function assertTeacherCanWriteProgressForStudent(
  teacherIdInput: string,
  studentIdInput: string,
  subjectIdInput?: string,
) {
  const teacherId = validateId(teacherIdInput, "Teacher");
  const studentId = validateId(studentIdInput, "Student");
  const subjectId = subjectIdInput ? validateId(subjectIdInput, "Subject") : undefined;

  const teacher = await prisma.appUser.findFirst({
    where: { id: teacherId, role: UserRole.TEACHER },
    select: { id: true, role: true },
  });
  if (teacher === null) {
    throw new Error("Unauthorized: teacher not found");
  }

  if (subjectId) {
    await assertSubjectExists(subjectId);
  }

  const lesson = await prisma.scheduledClass.findFirst({
    where: buildTeacherStudentLessonScope(teacherId, studentId),
    select: { id: true },
  });

  if (!lesson) {
    throw new Error("Unauthorized: student is not assigned to this teacher");
  }

  return lesson;
}

export async function createProgressNoteForTeacher(input: CreateProgressNoteForTeacherInput) {
  const teacherId = validateId(input.teacherId, "Teacher");
  const studentId = validateId(input.studentId, "Student");
  const subjectId = validateId(input.subjectId, "Subject");
  const content = validateContent(input.content);
  const performanceLevel = validatePerformanceLevel(input.performanceLevel);

  await assertTeacherCanWriteProgressForStudent(teacherId, studentId, subjectId);

  const created = (await prisma.studentProgress.create({
    data: {
      teacherId,
      studentId,
      subjectId,
      teacherNotes: content,
      gradeLevel: performanceLevel,
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  })) as ProgressNoteRecord;

  const mapped = mapProgressNote(created);
  return Object.assign(mapped, {
    before: null,
    after: mapped,
  });
}

export async function getProgressNoteForTeacher(
  teacherIdInput: string,
  progressNoteIdInput: string,
) {
  const teacherId = validateId(teacherIdInput, "Teacher");
  const progressNoteId = validateId(progressNoteIdInput, "Progress note");

  const note = (await prisma.studentProgress.findFirst({
    where: {
      id: progressNoteId,
      teacherId,
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  })) as ProgressNoteRecord | null;

  return note ? mapProgressNote(note) : null;
}

export async function updateProgressNoteForTeacher(
  progressNoteIdInput: string,
  teacherIdInput: string,
  input: UpdateProgressNoteForTeacherInput,
) {
  const progressNoteId = validateId(progressNoteIdInput, "Progress note");
  const teacherId = validateId(teacherIdInput, "Teacher");
  const content = validateContent(input.content);
  const performanceLevel = validatePerformanceLevel(input.performanceLevel);

  const existing = (await prisma.studentProgress.findFirst({
    where: {
      id: progressNoteId,
      teacherId,
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  })) as ProgressNoteRecord | null;

  if (!existing) {
    throw new Error("Unauthorized: progress note not found");
  }
  if (existing.archivedAt) {
    throw new Error("Archived progress notes cannot be edited");
  }

  const updated = (await prisma.studentProgress.update({
    where: { id: progressNoteId },
    data: {
      teacherNotes: content,
      gradeLevel: performanceLevel,
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  })) as ProgressNoteRecord;

  const before = mapProgressNote(existing);
  const after = mapProgressNote(updated);
  return Object.assign(after, { before, after });
}

export async function archiveProgressNoteForTeacher(
  progressNoteIdInput: string,
  teacherIdInput: string,
) {
  const progressNoteId = validateId(progressNoteIdInput, "Progress note");
  const teacherId = validateId(teacherIdInput, "Teacher");

  const existing = (await prisma.studentProgress.findFirst({
    where: {
      id: progressNoteId,
      teacherId,
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  })) as ProgressNoteRecord | null;

  if (!existing) {
    throw new Error("Unauthorized: progress note not found");
  }

  const archivedAt = new Date();
  const updated = (await prisma.studentProgress.update({
    where: { id: progressNoteId },
    data: { archivedAt },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  })) as ProgressNoteRecord;

  const before = mapProgressNote(existing);
  const after = mapProgressNote(updated);
  return Object.assign(after, { before, after });
}

export async function listProgressNotesForTeacherStudent(
  teacherIdInput: string,
  studentIdInput: string,
  filters: ProgressListFilters = {},
) {
  const teacherId = validateId(teacherIdInput, "Teacher");
  const studentId = validateId(studentIdInput, "Student");

  await assertTeacherCanWriteProgressForStudent(teacherId, studentId);

  const where: Prisma.StudentProgressWhereInput = {
    teacherId,
    studentId,
    ...progressArchivedWhere(filters.status),
  };

  if (filters.subjectId) {
    where.subjectId = filters.subjectId;
  }

  const notes = (await prisma.studentProgress.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: { recordedAt: "desc" },
  })) as ProgressNoteRecord[];

  return notes.map(mapProgressNote);
}

export async function listProgressNotesForTeacher(
  teacherIdInput: string,
  filters: TeacherProgressListFilters = {},
) {
  const teacherId = validateId(teacherIdInput, "Teacher");
  const where: Prisma.StudentProgressWhereInput = {
    teacherId,
    ...progressArchivedWhere(filters.status),
  };

  const studentId = filters.studentId?.trim();
  if (studentId) {
    where.studentId = studentId;
  }

  const subjectId = filters.subjectId?.trim();
  if (subjectId) {
    where.subjectId = subjectId;
  }

  const performanceLevel = normalizePerformanceLevel(filters.performanceLevel);
  if (performanceLevel) {
    where.gradeLevel = performanceLevel;
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { teacherNotes: { contains: search, mode: "insensitive" } },
      {
        student: {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const notes = (await prisma.studentProgress.findMany({
    where,
    include: {
      student: { select: { id: true, fullName: true, email: true } },
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: progressSortOrder(filters.sort),
  })) as ProgressNoteRecord[];

  return notes.map(mapTeacherProgressRow);
}

export async function listProgressNotesForStudent(
  studentIdInput: string,
  filters: ProgressListFilters = {},
) {
  const studentId = validateId(studentIdInput, "Student");
  const where: Prisma.StudentProgressWhereInput = {
    studentId,
    ...progressArchivedWhere(filters.status),
  };

  const subjectId = filters.subjectId?.trim();
  if (subjectId) {
    where.subjectId = subjectId;
  }

  const performanceLevel = normalizePerformanceLevel(filters.performanceLevel);
  if (performanceLevel) {
    where.gradeLevel = performanceLevel;
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { teacherNotes: { contains: search, mode: "insensitive" } },
      {
        subject: {
          name: { contains: search, mode: "insensitive" },
        },
      },
      {
        teacher: {
          fullName: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  const notes = (await prisma.studentProgress.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: progressSortOrder(filters.sort),
  })) as ProgressNoteRecord[];

  return notes.map(mapProgressNote);
}

export async function listProgressNotesForParentChild(
  parentIdInput: string,
  studentIdInput: string,
  filters: ProgressListFilters = {},
) {
  const parentId = validateId(parentIdInput, "Parent");
  const studentId = validateId(studentIdInput, "Student");
  const where: Prisma.StudentProgressWhereInput = {
    studentId,
    student: {
      parents: {
        some: { id: parentId },
      },
    },
    ...progressArchivedWhere(filters.status),
  };
  if (filters.subjectId) {
    where.subjectId = filters.subjectId;
  }

  const notes = (await prisma.studentProgress.findMany({
    where,
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: { recordedAt: "desc" },
  })) as ProgressNoteRecord[];

  return notes.map(mapProgressNote);
}

export async function listTeacherStudentsForProgress(teacherIdInput: string) {
  const teacherId = validateId(teacherIdInput, "Teacher");
  const students = await prisma.appUser.findMany({
    where: buildAssignedStudentWhere(teacherId),
    select: {
      id: true,
      fullName: true,
      email: true,
      learningStatus: true,
      enrolledClasses: {
        where: {
          OR: [{ teacherId }, { classGroup: { teacherId } }],
        },
        select: { id: true, teacherId: true, classGroup: { select: { teacherId: true } } },
      },
      enrolledClassGroups: {
        where: { teacherId },
        select: { id: true },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return students.map((student): TeacherStudentProgressListItem => {
    const ownershipPaths: TeacherStudentProgressListItem["ownershipPaths"] = [];
    if (student.enrolledClasses.some((lesson) => lesson.teacherId === teacherId)) {
      ownershipPaths.push("DIRECT_LESSON");
    }
    if (
      student.enrolledClassGroups.length > 0 ||
      student.enrolledClasses.some((lesson) => lesson.classGroup?.teacherId === teacherId)
    ) {
      ownershipPaths.push("CLASS_GROUP");
    }
    return {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      learningStatus: student.learningStatus ?? null,
      href: `/portal/teacher/students/${student.id}`,
      ownershipPaths,
    };
  });
}

export async function getTeacherStudentDetail(teacherIdInput: string, studentIdInput: string) {
  const teacherId = validateId(teacherIdInput, "Teacher");
  const studentId = validateId(studentIdInput, "Student");

  const student = await prisma.appUser.findFirst({
    where: {
      id: studentId,
      ...buildAssignedStudentWhere(teacherId),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      learningStatus: true,
    },
  });

  if (!student) {
    return null;
  }

  const [classGroups, lessons, notes] = await Promise.all([
    prisma.classGroup.findMany({
      where: {
        teacherId,
        students: { some: { id: studentId } },
      },
      select: {
        id: true,
        name: true,
        subject: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.scheduledClass.findMany({
      where: buildTeacherStudentLessonScope(teacherId, studentId),
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        subject: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.studentProgress.findMany({
      where: {
        teacherId,
        studentId,
      },
      select: {
        id: true,
        gradeLevel: true,
        subject: { select: { id: true, name: true } },
        archivedAt: true,
      },
      orderBy: { recordedAt: "desc" },
      take: 25,
    }),
  ]);

  const now = Date.now();
  const subjects = new Map<string, { id: string; name: string }>();
  for (const group of classGroups) {
    if (group.subject) subjects.set(group.subject.id, group.subject);
  }
  for (const lesson of lessons) {
    if (lesson.subject) subjects.set(lesson.subject.id, lesson.subject);
  }
  for (const note of notes) {
    if (note.subject) subjects.set(note.subject.id, note.subject);
  }

  return {
    id: student.id,
    fullName: student.fullName,
    email: student.email,
    learningStatus: student.learningStatus ?? null,
    classGroups: classGroups.map((group) => ({
      id: group.id,
      name: group.name,
      href: `/portal/teacher/classes/${group.id}`,
      subject: group.subject,
    })),
    upcomingLessons: lessons
      .filter((lesson) => lesson.startAt.getTime() >= now)
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        startAt: lesson.startAt.toISOString(),
        endAt: lesson.endAt.toISOString(),
        subject: lesson.subject,
        classGroup: lesson.classGroup,
        href: `/portal/teacher/lessons/${lesson.id}`,
      })),
    pastLessons: lessons
      .filter((lesson) => lesson.startAt.getTime() < now)
      .reverse()
      .map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        startAt: lesson.startAt.toISOString(),
        endAt: lesson.endAt.toISOString(),
        subject: lesson.subject,
        classGroup: lesson.classGroup,
        href: `/portal/teacher/lessons/${lesson.id}`,
      })),
    progressSummary: {
      totalNotes: notes.filter((note) => !note.archivedAt).length,
      latestPerformanceLevel: notes.find((note) => !note.archivedAt)?.gradeLevel ?? null,
    },
    subjects: Array.from(subjects.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    progressHref: `/portal/teacher/students/${student.id}/progress`,
  };
}
