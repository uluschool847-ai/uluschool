import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type SubjectDatabase = typeof prisma | Prisma.TransactionClient;

export type AdminSubjectRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number;
  teachersCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ActiveSubjectRecord = Omit<AdminSubjectRecord, "teachersCount">;

export type SubjectMutationInput = {
  slug: string;
  name: string;
  description: string;
  isActive?: boolean;
  priority?: number;
};

const adminSubjectInclude = {
  _count: {
    select: {
      teacherSubjects: true,
    },
  },
} satisfies Prisma.SubjectInclude;

function buildSubjectWhere(filters?: {
  searchQuery?: string;
  isActive?: boolean;
}): Prisma.SubjectWhereInput {
  const where: Prisma.SubjectWhereInput = {};
  const searchQuery = filters?.searchQuery?.trim();

  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (searchQuery) {
    where.OR = [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  return where;
}

function mapAdminSubject(
  subject: Prisma.SubjectGetPayload<{ include: typeof adminSubjectInclude }>,
): AdminSubjectRecord {
  return {
    id: subject.id,
    slug: subject.slug,
    name: subject.name,
    description: subject.description,
    isActive: subject.isActive,
    priority: subject.priority,
    teachersCount: subject._count.teacherSubjects,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

function subjectSnapshot(subject: {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  priority: number;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: subject.id,
    slug: subject.slug,
    name: subject.name,
    description: subject.description,
    isActive: subject.isActive,
    priority: subject.priority,
    ...(subject.createdAt ? { createdAt: subject.createdAt } : {}),
    ...(subject.updatedAt ? { updatedAt: subject.updatedAt } : {}),
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function listAdminSubjects(filters?: {
  searchQuery?: string;
  isActive?: boolean;
}) {
  const subjects = await prisma.subject.findMany({
    where: buildSubjectWhere(filters),
    include: adminSubjectInclude,
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });

  return subjects.map((subject) => mapAdminSubject(subject));
}

export async function getSubjectById(id: string, database: SubjectDatabase = prisma) {
  const subject = await database.subject.findUnique({
    where: { id },
    include: adminSubjectInclude,
  });

  return subject ? mapAdminSubject(subject) : null;
}

export async function createSubject(
  input: SubjectMutationInput,
  database: SubjectDatabase = prisma,
) {
  const existing = await database.subject.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Subject slug already exists.");
  }

  try {
    const subject = await database.subject.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description,
        isActive: input.isActive ?? true,
        priority: input.priority ?? 0,
      },
      include: adminSubjectInclude,
    });

    return mapAdminSubject(subject);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Subject slug already exists.");
    }
    throw error;
  }
}

export async function updateSubject(
  id: string,
  input: Partial<SubjectMutationInput>,
  database: SubjectDatabase = prisma,
) {
  const before = await database.subject.findUnique({
    where: { id },
    include: adminSubjectInclude,
  });

  if (!before) {
    throw new Error("Subject not found.");
  }

  if (input.slug && input.slug !== before.slug) {
    const existing = await database.subject.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      throw new Error("Subject slug already exists.");
    }
  }

  try {
    const subject = await database.subject.update({
      where: { id },
      data: {
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
      include: adminSubjectInclude,
    });
    const mapped = mapAdminSubject(subject);

    return Object.assign(mapped, {
      before: subjectSnapshot(before),
      after: subjectSnapshot(subject),
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Subject slug already exists.");
    }
    throw error;
  }
}

export async function setSubjectActive(
  id: string,
  isActive: boolean,
  database: SubjectDatabase = prisma,
) {
  const before = await database.subject.findUnique({
    where: { id },
    include: adminSubjectInclude,
  });

  if (!before) {
    throw new Error("Subject not found.");
  }

  const subject = await database.subject.update({
    where: { id },
    data: { isActive },
    include: adminSubjectInclude,
  });
  const mapped = mapAdminSubject(subject);

  return Object.assign(mapped, {
    before: subjectSnapshot(before),
    after: subjectSnapshot(subject),
  });
}

export async function deleteSubject(id: string, database: SubjectDatabase = prisma) {
  const existing = await database.subject.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          teacherSubjects: true,
          levelSubjects: true,
          studentProgress: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Subject not found.");
  }

  const [assignmentCount, scheduledClassCount] = await Promise.all([
    database.assignment.count({ where: { subjectId: id } }),
    database.scheduledClass.count({ where: { subjectId: id } }),
  ]);

  const dependencyCounts = {
    TeacherSubject: existing._count.teacherSubjects,
    LevelSubject: existing._count.levelSubjects,
    StudentProgress: existing._count.studentProgress,
    "Assignment.subjectId": assignmentCount,
    "ScheduledClass.subjectId": scheduledClassCount,
  };
  const blockingDependencies = Object.entries(dependencyCounts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}: ${count}`);

  if (blockingDependencies.length > 0) {
    throw new Error(
      `Subject has dependencies and cannot be deleted safely (${blockingDependencies.join(", ")}).`,
    );
  }

  await database.subject.delete({ where: { id } });
  const result = { id };
  Object.defineProperty(result, "before", {
    value: subjectSnapshot(existing),
    enumerable: false,
  });
  return result;
}

export async function listActiveSubjects() {
  return prisma.subject.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });
}
