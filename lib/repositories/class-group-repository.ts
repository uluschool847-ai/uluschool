import { ClassGroupStatus, type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ClassGroupDatabase = typeof prisma | Prisma.TransactionClient;

export type ClassGroupMutationInput = {
  name: string;
  description?: string | null;
  subjectId?: string | null;
  levelId?: string | null;
  teacherId?: string | null;
  status?: ClassGroupStatus;
  capacity?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
};

export type ClassGroupFilters = {
  searchQuery?: string;
  status?: ClassGroupStatus;
  teacherId?: string;
  subjectId?: string;
  levelId?: string;
};

const subjectSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.SubjectSelect;

const levelSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.LevelSelect;

const teacherSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} satisfies Prisma.AppUserSelect;

const studentSelect = {
  id: true,
  fullName: true,
  email: true,
  isActive: true,
} satisfies Prisma.AppUserSelect;

function adminClassGroupInclude(now = new Date()) {
  return {
    subject: { select: subjectSelect },
    level: { select: levelSelect },
    teacher: { select: teacherSelect },
    students: { select: studentSelect, orderBy: { fullName: "asc" as const } },
    _count: {
      select: {
        students: true,
      },
    },
    lessons: {
      where: { startAt: { gte: now } },
      select: { id: true },
    },
  } satisfies Prisma.ClassGroupInclude;
}

type ClassGroupWithAdminInclude = Prisma.ClassGroupGetPayload<{
  include: ReturnType<typeof adminClassGroupInclude>;
}>;

function buildWhere(filters?: ClassGroupFilters): Prisma.ClassGroupWhereInput {
  const where: Prisma.ClassGroupWhereInput = {};
  const searchQuery = filters?.searchQuery?.trim();

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.teacherId) {
    where.teacherId = filters.teacherId;
  }

  if (filters?.subjectId) {
    where.subjectId = filters.subjectId;
  }

  if (filters?.levelId) {
    where.levelId = filters.levelId;
  }

  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { teacher: { fullName: { contains: searchQuery, mode: "insensitive" } } },
      { teacher: { email: { contains: searchQuery, mode: "insensitive" } } },
      { subject: { name: { contains: searchQuery, mode: "insensitive" } } },
      { subject: { slug: { contains: searchQuery, mode: "insensitive" } } },
    ];
  }

  return where;
}

function classGroupSnapshot(group: {
  id: string;
  name: string;
  description?: string | null;
  subjectId?: string | null;
  levelId?: string | null;
  teacherId?: string | null;
  status: ClassGroupStatus;
  capacity?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    subjectId: group.subjectId ?? null,
    levelId: group.levelId ?? null,
    teacherId: group.teacherId ?? null,
    status: group.status,
    capacity: group.capacity ?? null,
    startDate: group.startDate ?? null,
    endDate: group.endDate ?? null,
    ...(group.createdAt ? { createdAt: group.createdAt } : {}),
    ...(group.updatedAt ? { updatedAt: group.updatedAt } : {}),
  };
}

function mapClassGroup(group: ClassGroupWithAdminInclude) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    subjectId: group.subjectId,
    levelId: group.levelId,
    teacherId: group.teacherId,
    status: group.status,
    capacity: group.capacity,
    startDate: group.startDate,
    endDate: group.endDate,
    subject: group.subject,
    level: group.level,
    teacher: group.teacher,
    students: group.students,
    studentsCount: group._count.students,
    upcomingLessonsCount: group.lessons.length,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

async function assertTeacher(teacherId: string, database: ClassGroupDatabase) {
  const teacher = await database.appUser.findUnique({
    where: { id: teacherId },
    select: { id: true, role: true },
  });

  if (!teacher || teacher.role !== UserRole.TEACHER) {
    throw new Error("Selected teacher must be an existing teacher account.");
  }
}

async function assertStudent(studentId: string, database: ClassGroupDatabase) {
  const student = await database.appUser.findUnique({
    where: { id: studentId },
    select: { id: true, role: true },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Selected student must be an existing student account.");
  }
}

async function assertSubject(subjectId: string, database: ClassGroupDatabase) {
  const subject = await database.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });

  if (!subject) {
    throw new Error("Selected subject must be an existing subject.");
  }
}

async function assertLevel(levelId: string, database: ClassGroupDatabase) {
  const level = await database.level.findUnique({
    where: { id: levelId },
    select: { id: true },
  });

  if (!level) {
    throw new Error("Selected level must be an existing level.");
  }
}

async function validateReferences(
  input: Partial<ClassGroupMutationInput>,
  database: ClassGroupDatabase,
) {
  if (input.teacherId) {
    await assertTeacher(input.teacherId, database);
  }
  if (input.subjectId) {
    await assertSubject(input.subjectId, database);
  }
  if (input.levelId) {
    await assertLevel(input.levelId, database);
  }
}

function buildMutationData(input: ClassGroupMutationInput): Prisma.ClassGroupCreateInput {
  return {
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? ClassGroupStatus.ACTIVE,
    capacity: input.capacity ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    ...(input.teacherId ? { teacher: { connect: { id: input.teacherId } } } : {}),
    ...(input.subjectId ? { subject: { connect: { id: input.subjectId } } } : {}),
    ...(input.levelId ? { level: { connect: { id: input.levelId } } } : {}),
  };
}

function buildUpdateData(input: Partial<ClassGroupMutationInput>): Prisma.ClassGroupUpdateInput {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity ?? null } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate ?? null } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate ?? null } : {}),
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
    ...(input.levelId !== undefined
      ? input.levelId
        ? { level: { connect: { id: input.levelId } } }
        : { level: { disconnect: true } }
      : {}),
  };
}

export async function listAdminClassGroups(filters: ClassGroupFilters = {}) {
  const groups = await prisma.classGroup.findMany({
    where: buildWhere(filters),
    include: adminClassGroupInclude(),
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return groups.map((group) => mapClassGroup(group));
}

export async function getClassGroupById(id: string, database: ClassGroupDatabase = prisma) {
  const group = await database.classGroup.findUnique({
    where: { id },
    include: adminClassGroupInclude(),
  });

  return group ? mapClassGroup(group) : null;
}

export async function createClassGroup(
  input: ClassGroupMutationInput,
  database: ClassGroupDatabase = prisma,
) {
  await validateReferences(input, database);

  const group = await database.classGroup.create({
    data: buildMutationData(input),
    include: adminClassGroupInclude(),
  });

  return mapClassGroup(group);
}

export async function updateClassGroup(
  id: string,
  input: Partial<ClassGroupMutationInput>,
  database: ClassGroupDatabase = prisma,
) {
  const before = await database.classGroup.findUnique({
    where: { id },
    include: adminClassGroupInclude(),
  });

  if (!before) {
    throw new Error("Class group not found.");
  }

  await validateReferences(input, database);

  const after = await database.classGroup.update({
    where: { id },
    data: buildUpdateData(input),
    include: adminClassGroupInclude(),
  });
  const mapped = mapClassGroup(after);

  return Object.assign(mapped, {
    before: classGroupSnapshot(before),
    after: classGroupSnapshot(after),
  });
}

export async function setClassGroupStatus(
  id: string,
  status: ClassGroupStatus,
  database: ClassGroupDatabase = prisma,
) {
  const before = await database.classGroup.findUnique({
    where: { id },
    include: adminClassGroupInclude(),
  });

  if (!before) {
    throw new Error("Class group not found.");
  }

  const after = await database.classGroup.update({
    where: { id },
    data: { status },
    include: adminClassGroupInclude(),
  });
  const mapped = mapClassGroup(after);

  return Object.assign(mapped, {
    before: classGroupSnapshot(before),
    after: classGroupSnapshot(after),
  });
}

export async function deleteClassGroup(id: string, database: ClassGroupDatabase = prisma) {
  const existing = await database.classGroup.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          students: true,
          lessons: true,
        },
      },
      lessons: {
        include: {
          assignments: {
            select: {
              _count: {
                select: { submissions: true },
              },
            },
          },
          _count: {
            select: {
              assignments: true,
              courseMaterials: true,
              reminders: true,
            },
          },
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Class group not found.");
  }

  const dependencyCounts = {
    students: existing._count.students,
    lessons: existing._count.lessons,
    assignments: existing.lessons.reduce(
      (total, lesson) => total + (lesson._count.assignments ?? 0),
      0,
    ),
    submissions: existing.lessons.reduce(
      (total, lesson) =>
        total +
        lesson.assignments.reduce(
          (assignmentTotal, assignment) => assignmentTotal + (assignment._count.submissions ?? 0),
          0,
        ),
      0,
    ),
    courseMaterials: existing.lessons.reduce(
      (total, lesson) => total + (lesson._count.courseMaterials ?? 0),
      0,
    ),
    reminders: existing.lessons.reduce(
      (total, lesson) => total + (lesson._count.reminders ?? 0),
      0,
    ),
  };
  const blockingDependencies = Object.entries(dependencyCounts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}: ${count}`);

  if (blockingDependencies.length > 0) {
    throw new Error(
      `Class group has dependencies and cannot be deleted safely (${blockingDependencies.join(
        ", ",
      )}).`,
    );
  }

  await database.classGroup.delete({ where: { id } });
  const result = { id };
  Object.defineProperty(result, "before", {
    value: classGroupSnapshot(existing),
    enumerable: false,
  });
  return result;
}

export async function enrollStudentToClassGroup(
  groupId: string,
  studentId: string,
  database: ClassGroupDatabase = prisma,
) {
  await assertStudent(studentId, database);

  const group = await database.classGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      capacity: true,
      students: { select: { id: true } },
      _count: { select: { students: true } },
    },
  });

  if (!group) {
    throw new Error("Class group not found.");
  }

  if (group.students.some((student) => student.id === studentId)) {
    throw new Error("Student already enrolled in this class group.");
  }

  if (group.capacity !== null && group._count.students >= group.capacity) {
    throw new Error("Class group capacity has been reached.");
  }

  const updated = await database.classGroup.update({
    where: { id: groupId },
    data: {
      students: {
        connect: { id: studentId },
      },
    },
    include: adminClassGroupInclude(),
  });

  return mapClassGroup(updated);
}

export async function unenrollStudentFromClassGroup(
  groupId: string,
  studentId: string,
  database: ClassGroupDatabase = prisma,
) {
  const group = await database.classGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      students: { select: { id: true } },
    },
  });

  if (!group) {
    throw new Error("Class group not found.");
  }

  if (!group.students.some((student) => student.id === studentId)) {
    throw new Error("Student is not enrolled in this class group.");
  }

  const updated = await database.classGroup.update({
    where: { id: groupId },
    data: {
      students: {
        disconnect: { id: studentId },
      },
    },
    include: adminClassGroupInclude(),
  });

  return mapClassGroup(updated);
}

export async function listAvailableStudentsForClassGroup(
  groupId: string,
  database: ClassGroupDatabase = prisma,
) {
  const group = await database.classGroup.findUnique({
    where: { id: groupId },
    select: { students: { select: { id: true } } },
  });

  if (!group) {
    throw new Error("Class group not found.");
  }

  return database.appUser.findMany({
    where: {
      role: UserRole.STUDENT,
      id: { notIn: group.students.map((student) => student.id) },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
  });
}

export async function listClassGroupLessons(
  groupId: string,
  database: ClassGroupDatabase = prisma,
) {
  return database.scheduledClass.findMany({
    where: { classGroupId: groupId },
    include: {
      subject: { select: subjectSelect },
    },
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });
}
