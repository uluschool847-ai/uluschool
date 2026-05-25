import { type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const DEFAULT_GRADEBOOK_WEIGHTS = {
  HOMEWORK: 70,
  MANUAL: 30,
} as const;

type GradebookDatabase = typeof prisma | Prisma.TransactionClient;
type GradebookWeights = typeof DEFAULT_GRADEBOOK_WEIGHTS;
type GradebookStudent = { id: string; fullName?: string; email?: string };
type GradebookSubject = { id: string; name: string };
type GradebookClassGroup = {
  id: string;
  name: string;
  students?: GradebookStudent[];
};
type GradebookHomeworkSubmission = {
  feedback?: string | null;
  id: string;
  grade: number | null;
  submittedAt?: Date;
  student?: GradebookStudent | null;
  assignment?: {
    subjectId?: string | null;
    title?: string | null;
    scheduledClass?: {
      classGroup?: { id: string; name: string } | null;
      subjectId?: string | null;
      subject?: GradebookSubject | null;
    } | null;
  } | null;
};
type GradebookManualGrade = {
  id: string;
  academicTermId?: string;
  archivedAt?: Date | null;
  classGroup?: { id: string; name: string } | null;
  classGroupId?: string | null;
  description?: string | null;
  gradedAt?: Date;
  score: number;
  student?: GradebookStudent | null;
  studentId?: string;
  subject?: GradebookSubject | null;
  subjectId?: string;
  teacherId?: string;
  title: string;
};

export type ManualGradeInput = {
  academicTermId: string;
  classGroupId?: string | null;
  description?: string | null;
  score: number;
  studentId: string;
  subjectId: string;
  title: string;
};

function normalizeTermRange(term: { startDate: Date; endDate: Date }) {
  return {
    gte: term.startDate,
    lte: term.endDate,
  };
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number");
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}

export function calculateWeightedTermAverage(input: {
  categoryAverages: Partial<Record<keyof GradebookWeights, number | null>>;
  weights?: GradebookWeights;
}) {
  const weights = input.weights ?? DEFAULT_GRADEBOOK_WEIGHTS;
  let weightedTotal = 0;
  let denominator = 0;

  for (const category of Object.keys(weights) as Array<keyof GradebookWeights>) {
    const value = input.categoryAverages[category];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    weightedTotal += value * weights[category];
    denominator += weights[category];
  }

  if (denominator === 0) return null;
  return Math.round((weightedTotal / denominator) * 100) / 100;
}

function validateScore(score: unknown) {
  const value = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(value)) throw new Error("Score must be a number.");
  if (value < 0) throw new Error("Score must be at least 0.");
  if (value > 100) throw new Error("Score must be at most 100.");
  return value;
}

function validateManualGradeInput(input: ManualGradeInput) {
  if (!input.studentId?.trim()) throw new Error("Student is required.");
  if (!input.subjectId?.trim()) throw new Error("Subject is required.");
  if (!input.academicTermId?.trim()) throw new Error("Academic term is required.");
  if (!input.title?.trim()) throw new Error("Title is required.");

  return {
    academicTermId: input.academicTermId.trim(),
    classGroupId: input.classGroupId?.trim() || null,
    description: input.description?.trim() || null,
    score: validateScore(input.score),
    studentId: input.studentId.trim(),
    subjectId: input.subjectId.trim(),
    title: input.title.trim(),
  };
}

function compactManualGrade(grade: GradebookManualGrade) {
  return {
    id: grade.id,
    academicTermId: grade.academicTermId,
    classGroupId: grade.classGroupId ?? null,
    description: grade.description ?? null,
    score: grade.score,
    studentId: grade.studentId,
    subjectId: grade.subjectId,
    teacherId: grade.teacherId,
    title: grade.title,
    archivedAt: grade.archivedAt ?? null,
  };
}

async function getTerm(termId?: string | null, database: GradebookDatabase = prisma) {
  if (termId?.trim()) {
    return database.academicTerm.findFirst({ where: { id: termId.trim() } });
  }
  return database.academicTerm.findFirst({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
  });
}

function homeworkGradeWhereForTeacher(teacherId: string, term: { startDate: Date; endDate: Date }) {
  return {
    grade: { not: null },
    submittedAt: normalizeTermRange(term),
    assignment: {
      scheduledClass: {
        classGroup: { teacherId },
      },
    },
  } satisfies Prisma.SubmissionWhereInput;
}

function homeworkInclude() {
  return {
    student: { select: { id: true, fullName: true, email: true } },
    assignment: {
      include: {
        scheduledClass: {
          select: {
            id: true,
            title: true,
            teacherId: true,
            classGroupId: true,
            subjectId: true,
            classGroup: { select: { id: true, name: true, teacherId: true } },
            subject: { select: { id: true, name: true } },
          },
        },
      },
    },
  } satisfies Prisma.SubmissionInclude;
}

function manualGradeInclude() {
  return {
    student: { select: { id: true, fullName: true, email: true } },
    subject: { select: { id: true, name: true } },
    classGroup: { select: { id: true, name: true } },
  } satisfies Prisma.ManualGradeEntryInclude;
}

function mapManualGrade(grade: GradebookManualGrade) {
  return {
    id: grade.id,
    title: grade.title,
    description: grade.description,
    score: grade.score,
    gradedAt: grade.gradedAt,
    archivedAt: grade.archivedAt,
    category: "MANUAL" as const,
    subject: grade.subject ? { id: grade.subject.id, name: grade.subject.name } : null,
  };
}

function mapHomeworkGrade(submission: GradebookHomeworkSubmission) {
  const scheduledClass = submission.assignment?.scheduledClass;
  const subjectId = scheduledClass?.subjectId ?? submission.assignment?.subjectId;
  const subject =
    scheduledClass?.subject ??
    (subjectId && scheduledClass?.classGroup?.name
      ? {
          id: subjectId,
          name: scheduledClass.classGroup.name.replace(/\s+Group\b.*$/i, ""),
        }
      : null);

  return {
    id: submission.id,
    title: submission.assignment?.title ?? "Homework",
    score: submission.grade,
    gradedAt: submission.submittedAt,
    submittedAt: submission.submittedAt,
    feedback: submission.feedback ?? null,
    category: "HOMEWORK" as const,
    subject,
  };
}

function buildStudentGradebook(input: {
  student: { id: string; fullName?: string; email?: string };
  term: { id: string; name: string; startDate?: Date; endDate?: Date };
  homeworkSubmissions: GradebookHomeworkSubmission[];
  manualGrades: GradebookManualGrade[];
  manualGradeHistory?: GradebookManualGrade[];
}) {
  const homeworkGrades = input.homeworkSubmissions
    .filter((submission) => !submission.student || submission.student.id === input.student.id)
    .map(mapHomeworkGrade);
  const manualGrades = input.manualGrades
    .filter((grade) => {
      const ownerId = grade.studentId ?? grade.student?.id;
      return !ownerId || ownerId === input.student.id;
    })
    .map(mapManualGrade);
  const homeworkAverage = average(homeworkGrades.map((grade) => grade.score));
  const manualAverage = average(manualGrades.map((grade) => grade.score));
  const termAverage = calculateWeightedTermAverage({
    categoryAverages: { HOMEWORK: homeworkAverage, MANUAL: manualAverage },
  });

  return {
    student: {
      id: input.student.id,
      fullName: input.student.fullName ?? "Student",
      email: input.student.email ?? "",
    },
    term: input.term,
    categoryWeights: DEFAULT_GRADEBOOK_WEIGHTS,
    categories: [
      { label: "Homework", category: "HOMEWORK", average: homeworkAverage },
      { label: "Manual", category: "MANUAL", average: manualAverage },
    ],
    homeworkGrades,
    manualGrades,
    manualGradeHistory: (input.manualGradeHistory ?? [])
      .filter((grade) => {
        const ownerId = grade.studentId ?? grade.student?.id;
        return !ownerId || ownerId === input.student.id;
      })
      .map(mapManualGrade),
    termAverage,
  };
}

export async function listAcademicTerms(
  filters: { activeOnly?: boolean } = {},
  database: GradebookDatabase = prisma,
) {
  return database.academicTerm.findMany({
    where: filters.activeOnly ? { isActive: true } : {},
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });
}

export async function getTeacherClassGroupGradebook(
  teacherId: string,
  classGroupId: string,
  termId: string,
  database: GradebookDatabase = prisma,
) {
  const term = await getTerm(termId, database);
  if (!term) return null;

  const group = await database.classGroup.findFirst({
    where: { id: classGroupId, teacherId },
    include: {
      students: { select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } },
      subject: { select: { id: true, name: true } },
    },
  });
  if (!group) return null;

  const homeworkSubmissions = await database.submission.findMany({
    where: {
      ...homeworkGradeWhereForTeacher(teacherId, term),
      assignment: {
        scheduledClass: {
          classGroupId,
          classGroup: { teacherId },
        },
      },
    },
    include: homeworkInclude(),
  });
  const manualGrades = await database.manualGradeEntry.findMany({
    where: {
      teacherId,
      classGroupId,
      academicTermId: term.id,
      archivedAt: null,
    },
    include: manualGradeInclude(),
    orderBy: { gradedAt: "desc" },
  });

  const rows = ((group.students ?? []) as GradebookStudent[]).map((student) => {
    const homeworkAverage = average(
      homeworkSubmissions
        .filter((submission) => submission.student?.id === student.id)
        .map((submission) => submission.grade),
    );
    const manualAverage = average(
      manualGrades.filter((grade) => grade.student?.id === student.id).map((grade) => grade.score),
    );

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
      },
      homeworkAverage,
      manualAverage,
      termAverage: calculateWeightedTermAverage({
        categoryAverages: { HOMEWORK: homeworkAverage, MANUAL: manualAverage },
      }),
      studentGradebookHref: `/portal/teacher/gradebook/students/${student.id}?termId=${term.id}`,
    };
  });

  return {
    classGroup: { id: group.id, name: group.name },
    term: { id: term.id, name: term.name },
    categoryWeights: DEFAULT_GRADEBOOK_WEIGHTS,
    rows,
  };
}

export async function getTeacherStudentGradebook(
  teacherId: string,
  studentId: string,
  termId: string,
  database: GradebookDatabase = prisma,
) {
  const term = await getTerm(termId, database);
  if (!term) return null;

  const teacherStudentWhere = {
    id: studentId,
    role: UserRole.STUDENT,
    OR: [{ enrolledClasses: { some: { teacherId } } }, { classGroups: { some: { teacherId } } }],
  } as unknown as Prisma.AppUserWhereInput;
  const student = await database.appUser.findFirst({
    where: teacherStudentWhere,
    select: { id: true, fullName: true, email: true },
  });
  if (student === null) return null;

  const homeworkSubmissions = await database.submission.findMany({
    where: {
      studentId,
      grade: { not: null },
      submittedAt: normalizeTermRange(term),
      OR: [
        { assignment: { teacherId } },
        { assignment: { scheduledClass: { teacherId } } },
        { assignment: { scheduledClass: { classGroup: { teacherId } } } },
      ],
    },
    include: homeworkInclude(),
    orderBy: { submittedAt: "desc" },
  });
  const manualGrades = await database.manualGradeEntry.findMany({
    where: {
      teacherId,
      studentId,
      academicTermId: term.id,
      archivedAt: null,
    },
    include: manualGradeInclude(),
    orderBy: { gradedAt: "desc" },
  });
  const manualGradeHistory = await database.manualGradeEntry.findMany({
    where: {
      teacherId,
      studentId,
      academicTermId: term.id,
      archivedAt: { not: null },
    },
    include: manualGradeInclude(),
    orderBy: { gradedAt: "desc" },
  });
  const selectedStudent = (student ??
    homeworkSubmissions[0]?.student ??
    manualGrades[0]?.student ?? { id: studentId }) as {
    id: string;
    fullName?: string;
    email?: string;
  };

  return buildStudentGradebook({
    student: selectedStudent,
    term,
    homeworkSubmissions,
    manualGrades,
    manualGradeHistory,
  });
}

export async function getStudentGradebook(
  studentId: string,
  termId?: string | null,
  database: GradebookDatabase = prisma,
) {
  const term = await getTerm(termId, database);
  if (!term) return null;
  const student = await database.appUser.findFirst({
    where: { id: studentId, role: UserRole.STUDENT },
    select: { id: true, fullName: true, email: true },
  });
  if (!student) return null;

  const homeworkSubmissions = await database.submission.findMany({
    where: {
      studentId,
      grade: { not: null },
      submittedAt: normalizeTermRange(term),
    },
    include: homeworkInclude(),
    orderBy: { submittedAt: "desc" },
  });
  const manualGrades = await database.manualGradeEntry.findMany({
    where: {
      studentId,
      academicTermId: term.id,
      archivedAt: null,
    },
    include: manualGradeInclude(),
    orderBy: { gradedAt: "desc" },
  });
  const manualGradeHistory = await database.manualGradeEntry.findMany({
    where: {
      studentId,
      academicTermId: term.id,
      archivedAt: { not: null },
    },
    include: manualGradeInclude(),
    orderBy: { gradedAt: "desc" },
  });

  return buildStudentGradebook({
    student,
    term,
    homeworkSubmissions,
    manualGrades,
    manualGradeHistory,
  });
}

export async function getParentChildGradebook(
  parentId: string,
  studentId: string,
  termId: string,
  database: GradebookDatabase = prisma,
) {
  const parent = await database.appUser.findFirst({
    where: {
      id: parentId,
      role: UserRole.PARENT,
      children: { some: { id: studentId } },
    },
    select: { id: true },
  });
  if (!parent) return null;

  return getStudentGradebook(studentId, termId, database);
}

export async function listTeacherGradebookOverview(
  teacherId: string,
  filters: { termId?: string | null } = {},
  database: GradebookDatabase = prisma,
) {
  const groups = await database.classGroup.findMany({
    where: { teacherId },
    select: {
      id: true,
      name: true,
      students: { select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  const studentsById = new Map<string, GradebookStudent>();
  for (const group of groups as GradebookClassGroup[]) {
    for (const student of group.students ?? []) {
      studentsById.set(student.id, student);
    }
  }
  const termQuery = filters.termId ? `?termId=${encodeURIComponent(filters.termId)}` : "";

  return {
    classGroups: (groups as GradebookClassGroup[]).map((group) => ({
      id: group.id,
      name: group.name,
      studentsCount: group.students?.length ?? 0,
      href: `/portal/teacher/gradebook/classes/${group.id}${termQuery}`,
    })),
    students: [...studentsById.values()].map((student) => ({
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      href: `/portal/teacher/gradebook/students/${student.id}${termQuery}`,
    })),
  };
}

export async function createManualGradeEntryForTeacher(
  teacherId: string,
  input: ManualGradeInput,
  database: GradebookDatabase = prisma,
) {
  const data = validateManualGradeInput(input);
  const ownedStudentWhere = {
    id: data.studentId,
    role: UserRole.STUDENT,
    OR: [{ enrolledClasses: { some: { teacherId } } }, { classGroups: { some: { teacherId } } }],
  } as unknown as Prisma.AppUserWhereInput;
  const student = await database.appUser.findFirst({
    where: ownedStudentWhere,
    select: { id: true },
  });
  if (!student) throw new Error("Student is not assigned to this teacher.");

  const created = await database.manualGradeEntry.create({
    data: {
      ...data,
      teacherId,
      gradedAt: new Date(),
    },
  });

  return {
    ...created,
    before: null,
    after: compactManualGrade(created),
  };
}

export async function updateManualGradeEntryForTeacher(
  id: string,
  teacherId: string,
  input: ManualGradeInput,
  database: GradebookDatabase = prisma,
) {
  const data = validateManualGradeInput(input);
  const before = await database.manualGradeEntry.findFirst({
    where: { id, teacherId },
  });
  if (!before) throw new Error("Manual grade not found.");
  if (before.archivedAt) throw new Error("Archived manual grades cannot be updated.");

  const updated = await database.manualGradeEntry.update({
    where: { id },
    data,
  });

  return {
    ...updated,
    before: compactManualGrade(before),
    after: compactManualGrade(updated),
  };
}

export async function archiveManualGradeEntryForTeacher(
  id: string,
  teacherId: string,
  database: GradebookDatabase = prisma,
) {
  const before = await database.manualGradeEntry.findFirst({
    where: { id, teacherId },
  });
  if (!before) throw new Error("Manual grade not found.");

  const archived = await database.manualGradeEntry.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  return {
    ...archived,
    before: compactManualGrade(before),
    after: compactManualGrade(archived),
  };
}
