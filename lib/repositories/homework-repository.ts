import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type HomeworkDatabase = typeof prisma | Prisma.TransactionClient;

export type HomeworkFilters = {
  status?: "active" | "archived" | "history" | "all";
  classGroupId?: string | null;
  dueDateFrom?: Date | string | null;
  dueDateTo?: Date | string | null;
  search?: string | null;
  sort?: "dueDateAsc" | "dueDateDesc" | "title" | "classGroup" | "pendingSubmissions" | null;
  subjectId?: string | null;
};

export type CreateHomeworkAssignmentInput = {
  title: string;
  description?: string | null;
  scheduledClassId?: string | null;
  classId?: string | null;
  dueDate: Date;
  teacherId: string;
  subjectId?: string | null;
};

export type UpdateHomeworkAssignmentInput = {
  title?: string;
  description?: string | null;
  scheduledClassId?: string | null;
  classId?: string | null;
  dueDate?: Date;
  subjectId?: string | null;
};

const assignmentInclude = {
  scheduledClass: {
    select: {
      id: true,
      title: true,
      teacherId: true,
      classGroupId: true,
      classGroup: { select: { id: true, name: true, teacherId: true } },
      subject: { select: { id: true, name: true, slug: true } },
    },
  },
  submissions: { select: { id: true, grade: true } },
} satisfies Prisma.AssignmentInclude;

function teacherAssignmentScope(teacherId: string): Prisma.AssignmentWhereInput[] {
  return [
    { teacherId },
    { scheduledClass: { teacherId } },
    { scheduledClass: { classGroup: { teacherId } } },
  ];
}

function teacherScheduledClassScope(teacherId: string): Prisma.ScheduledClassWhereInput[] {
  return [{ teacherId }, { classGroup: { teacherId } }];
}

function assertTitle(title: string | undefined) {
  if (!title?.trim()) throw new Error("Title is required.");
}

function assertValidDate(date: Date | undefined, message: string) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(message);
  }
}

function scheduledClassIdFrom(input: {
  scheduledClassId?: string | null;
  classId?: string | null;
}) {
  return input.scheduledClassId?.trim() || input.classId?.trim() || "";
}

function parseFilterDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function orderByForSort(
  sort: HomeworkFilters["sort"],
): Prisma.AssignmentOrderByWithRelationInput[] {
  switch (sort) {
    case "dueDateDesc":
      return [{ dueDate: "desc" }, { title: "asc" }];
    case "title":
      return [{ title: "asc" }, { dueDate: "asc" }];
    case "classGroup":
      return [{ scheduledClass: { classGroup: { name: "asc" } } }, { title: "asc" }];
    case "dueDateAsc":
      return [{ dueDate: "asc" }, { title: "asc" }];
    case "pendingSubmissions":
      return [{ dueDate: "asc" }, { title: "asc" }];
    default:
      return [{ dueDate: "asc" }, { title: "asc" }];
  }
}

function archivedWhere(filters: HomeworkFilters = {}) {
  if (filters.status === "archived" || filters.status === "history") {
    return { archivedAt: { not: null } };
  }
  if (filters.status === "all") return {};
  return { archivedAt: null };
}

async function assertSubjectIfProvided(
  subjectId: string | null | undefined,
  database: HomeworkDatabase,
) {
  if (!subjectId) return;
  const subject = await database.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) throw new Error("Subject not found.");
}

export async function assertTeacherOwnsClassForHomework(
  teacherId: string,
  scheduledClassId: string,
  database: HomeworkDatabase = prisma,
) {
  if (!scheduledClassId.trim()) throw new Error("Scheduled class is required.");

  return resolveScheduledClassForHomework(teacherId, scheduledClassId, database);
}

async function resolveScheduledClassForHomework(
  teacherId: string,
  scheduledClassOrGroupId: string,
  database: HomeworkDatabase,
) {
  const scheduledClassSelect = {
    id: true,
    teacherId: true,
    classGroupId: true,
    classGroup: { select: { id: true, teacherId: true } },
  } satisfies Prisma.ScheduledClassSelect;
  const scheduledClassOrderBy = [
    { startAt: "asc" },
    { title: "asc" },
  ] satisfies Prisma.ScheduledClassOrderByWithRelationInput[];

  let scheduledClass = await database.scheduledClass.findFirst({
    where: {
      id: scheduledClassOrGroupId,
      OR: teacherScheduledClassScope(teacherId),
    },
    select: scheduledClassSelect,
    orderBy: scheduledClassOrderBy,
  });

  scheduledClass ??= await database.scheduledClass.findFirst({
    where: {
      classGroupId: scheduledClassOrGroupId,
      OR: teacherScheduledClassScope(teacherId),
    },
    select: scheduledClassSelect,
    orderBy: scheduledClassOrderBy,
  });

  if (!scheduledClass) {
    throw new Error("Unauthorized: teacher does not own this class.");
  }

  return scheduledClass;
}

async function assertScheduledClassIdForHomework(
  teacherId: string,
  scheduledClassOrGroupId: string,
  database: HomeworkDatabase,
) {
  const scheduledClass = await resolveScheduledClassForHomework(
    teacherId,
    scheduledClassOrGroupId,
    database,
  );

  return scheduledClass.id;
}

export async function assertTeacherOwnsAssignment(
  teacherId: string,
  assignmentId: string,
  database: HomeworkDatabase = prisma,
) {
  const assignment = await database.assignment.findFirst({
    where: {
      id: assignmentId,
      OR: teacherAssignmentScope(teacherId),
    },
    include: assignmentInclude,
  });

  if (!assignment) {
    throw new Error("Assignment not found or not owned by teacher.");
  }

  return assignment;
}

export async function createHomeworkAssignment(
  input: CreateHomeworkAssignmentInput,
  database: HomeworkDatabase = prisma,
) {
  assertTitle(input.title);
  const scheduledClassId = scheduledClassIdFrom(input);
  if (!scheduledClassId) throw new Error("Scheduled class is required.");
  assertValidDate(input.dueDate, "Due date must be valid.");
  await assertSubjectIfProvided(input.subjectId, database);
  const resolvedScheduledClassId = await assertScheduledClassIdForHomework(
    input.teacherId,
    scheduledClassId,
    database,
  );

  return database.assignment.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      dueDate: input.dueDate,
      scheduledClassId: resolvedScheduledClassId,
      teacherId: input.teacherId,
      subjectId: input.subjectId ?? null,
    },
    include: assignmentInclude,
  });
}

export async function getHomeworkAssignmentById(
  id: string,
  teacherId: string,
  database: HomeworkDatabase = prisma,
) {
  return database.assignment.findFirst({
    where: {
      id,
      OR: teacherAssignmentScope(teacherId),
    },
    include: assignmentInclude,
  });
}

export async function updateHomeworkAssignment(
  id: string,
  teacherId: string,
  input: UpdateHomeworkAssignmentInput,
  database: HomeworkDatabase = prisma,
) {
  const before = await assertTeacherOwnsAssignment(teacherId, id, database);
  if (before.archivedAt) throw new Error("Assignment is archived.");

  if (input.title !== undefined) assertTitle(input.title);
  if (input.dueDate !== undefined) assertValidDate(input.dueDate, "Due date must be valid.");
  await assertSubjectIfProvided(input.subjectId, database);

  const scheduledClassId = scheduledClassIdFrom(input);
  if (scheduledClassId) {
    await assertTeacherOwnsClassForHomework(teacherId, scheduledClassId, database);
  }
  const resolvedScheduledClassId = scheduledClassId
    ? await assertScheduledClassIdForHomework(teacherId, scheduledClassId, database)
    : "";

  const after = await database.assignment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() ?? "" } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(resolvedScheduledClassId ? { scheduledClassId: resolvedScheduledClassId } : {}),
      ...(input.subjectId !== undefined ? { subjectId: input.subjectId ?? null } : {}),
    },
    include: assignmentInclude,
  });

  return Object.assign(after, { before, after });
}

export async function archiveHomeworkAssignment(
  id: string,
  teacherId: string,
  database: HomeworkDatabase = prisma,
) {
  const before = await assertTeacherOwnsAssignment(teacherId, id, database);

  const after = await database.assignment.update({
    where: { id },
    data: { archivedAt: new Date() },
    include: assignmentInclude,
  });

  return Object.assign(after, { before, after });
}

export async function listHomeworkAssignmentsForTeacher(
  teacherId: string,
  filters: HomeworkFilters = {},
  database: HomeworkDatabase = prisma,
) {
  const dueDateFrom = parseFilterDate(filters.dueDateFrom);
  const dueDateTo = parseFilterDate(filters.dueDateTo);
  const extraFilters: Prisma.AssignmentWhereInput[] = [
    ...(dueDateFrom || dueDateTo
      ? [
          {
            dueDate: {
              ...(dueDateFrom ? { gte: dueDateFrom } : {}),
              ...(dueDateTo ? { lte: dueDateTo } : {}),
            },
          },
        ]
      : []),
    ...(filters.classGroupId
      ? [
          {
            OR: [
              { scheduledClassId: filters.classGroupId },
              { scheduledClass: { classGroupId: filters.classGroupId } },
            ],
          },
        ]
      : []),
    ...(filters.search
      ? [
          {
            OR: [
              { title: { contains: filters.search, mode: "insensitive" as const } },
              { description: { contains: filters.search, mode: "insensitive" as const } },
            ],
          },
        ]
      : []),
  ];

  const assignments = await database.assignment.findMany({
    where: {
      ...archivedWhere(filters),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      OR: teacherAssignmentScope(teacherId),
      ...(extraFilters.length > 0 ? { AND: extraFilters } : {}),
    },
    include: assignmentInclude,
    orderBy: orderByForSort(filters.sort),
  });

  if (filters.sort === "pendingSubmissions") {
    return assignments.toSorted((left, right) => {
      const leftPending = left.submissions.filter((submission) => submission.grade === null).length;
      const rightPending = right.submissions.filter(
        (submission) => submission.grade === null,
      ).length;
      return rightPending - leftPending || left.title.localeCompare(right.title);
    });
  }

  return assignments;
}

export async function listHomeworkAssignmentsForTeacherClass(
  teacherId: string,
  classOrGroupId: string,
  filters: HomeworkFilters = {},
  database: HomeworkDatabase = prisma,
) {
  return database.assignment.findMany({
    where: {
      ...archivedWhere(filters),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      OR: [
        { scheduledClassId: classOrGroupId },
        { scheduledClass: { classGroupId: classOrGroupId } },
      ],
      AND: [{ OR: teacherAssignmentScope(teacherId) }],
    },
    include: assignmentInclude,
    orderBy: [{ dueDate: "asc" }, { title: "asc" }],
  });
}
