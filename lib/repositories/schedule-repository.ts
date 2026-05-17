import { MeetingProvider, type Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ScheduleDatabase = typeof prisma | Prisma.TransactionClient;

export type AdminScheduledClassRecord = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  liveLessonUrl: string;
  timezone?: string | null;
  status?: string;
  meetingProvider?: MeetingProvider;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingUpdatedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  rescheduledFromId?: string | null;
  teacherId: string | null;
  subjectId: string | null;
  subject: { id: string; name: string; slug: string } | null;
  classGroupId: string | null;
  classGroup: { id: string; name: string } | null;
  teacher: { id: string; fullName: string; email: string; isActive: boolean } | null;
  students: Array<{ id: string; fullName: string; email: string; isActive: boolean }>;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduledClassMutationInput = {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  liveLessonUrl: string;
  meetingProvider?: MeetingProvider;
  teacherId: string;
  subjectId?: string | null;
  classGroupId?: string | null;
};

export type ScheduledClassUpdateInput = Partial<ScheduledClassMutationInput>;

const teacherSelect = {
  id: true,
  fullName: true,
  email: true,
  isActive: true,
} satisfies Prisma.AppUserSelect;

const studentSelect = {
  id: true,
  fullName: true,
  email: true,
  isActive: true,
} satisfies Prisma.AppUserSelect;

const subjectSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.SubjectSelect;

const classGroupSelect = {
  id: true,
  name: true,
} satisfies Prisma.ClassGroupSelect;

async function assertTeacherAccount(teacherId: string, database: ScheduleDatabase) {
  const teacher = await database.appUser.findUnique({
    where: { id: teacherId },
    select: { id: true, role: true },
  });

  if (!teacher || teacher.role !== UserRole.TEACHER) {
    throw new Error("Selected teacher must be an existing teacher account.");
  }

  return teacher;
}

async function assertSubjectExists(subjectId: string, database: ScheduleDatabase) {
  const subject = await database.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, isActive: true },
  });

  if (!subject) {
    throw new Error("Selected subject must be an existing subject.");
  }

  return subject;
}

async function assertClassGroupExists(classGroupId: string, database: ScheduleDatabase) {
  const classGroup = await database.classGroup.findUnique({
    where: { id: classGroupId },
    select: { id: true },
  });

  if (!classGroup) {
    throw new Error("Selected class group must be an existing class group.");
  }

  return classGroup;
}

function mutationSnapshot(scheduledClass: {
  id: string;
  title: string;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  liveLessonUrl?: string | null;
  meetingProvider?: MeetingProvider | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingUpdatedAt?: Date | null;
  teacherId?: string | null;
  subjectId?: string | null;
  classGroupId?: string | null;
}) {
  return {
    id: scheduledClass.id,
    title: scheduledClass.title,
    description: scheduledClass.description ?? null,
    startAt: scheduledClass.startAt ?? null,
    endAt: scheduledClass.endAt ?? null,
    liveLessonUrl: scheduledClass.liveLessonUrl ?? null,
    meetingProvider: scheduledClass.meetingProvider ?? MeetingProvider.GOOGLE_MEET,
    googleCalendarEventId: scheduledClass.googleCalendarEventId ?? null,
    googleMeetSpaceName: scheduledClass.googleMeetSpaceName ?? null,
    meetingUpdatedAt: scheduledClass.meetingUpdatedAt ?? null,
    teacherId: scheduledClass.teacherId ?? null,
    subjectId: scheduledClass.subjectId ?? null,
    classGroupId: scheduledClass.classGroupId ?? null,
  };
}

export async function listScheduleForUser(
  userId: string,
  role: UserRole,
  monthStart: Date,
  monthEnd: Date,
) {
  const where: Prisma.ScheduledClassWhereInput = {
    startAt: {
      gte: monthStart,
      lt: monthEnd,
    },
  };

  if (role === UserRole.TEACHER) {
    where.OR = [{ teacherId: userId }, { classGroup: { teacherId: userId } }];
  } else if (role === UserRole.STUDENT) {
    where.OR = [
      {
        students: {
          some: { id: userId },
        },
      },
      {
        classGroup: {
          students: {
            some: { id: userId },
          },
        },
      },
    ];
  } else if (role === UserRole.PARENT) {
    const parent = await prisma.appUser.findUnique({
      where: { id: userId },
      select: { children: { select: { id: true } } },
    });
    const childIds = parent?.children.map((child) => child.id) ?? [];

    where.OR = [
      {
        students: {
          some: { id: { in: childIds } },
        },
      },
      {
        classGroup: {
          students: {
            some: { id: { in: childIds } },
          },
        },
      },
    ];
  }

  return prisma.scheduledClass.findMany({
    where,
    include: {
      teacher: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      subject: { select: subjectSelect },
      classGroup: { select: classGroupSelect },
    },
    orderBy: { startAt: "asc" },
  });
}

export async function getAdminScheduledClassById(classId: string) {
  return prisma.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: teacherSelect },
      students: { select: studentSelect },
      subject: { select: subjectSelect },
      classGroup: { select: classGroupSelect },
    },
  }) as Promise<AdminScheduledClassRecord | null>;
}

export async function createScheduledClass(
  input: ScheduledClassMutationInput,
  database: ScheduleDatabase = prisma,
) {
  await assertTeacherAccount(input.teacherId, database);
  if (input.subjectId) {
    await assertSubjectExists(input.subjectId, database);
  }
  if (input.classGroupId) {
    await assertClassGroupExists(input.classGroupId, database);
  }

  const data: Prisma.ScheduledClassCreateInput = {
    title: input.title,
    description: input.description ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    liveLessonUrl: input.liveLessonUrl,
    ...(input.meetingProvider ? { meetingProvider: input.meetingProvider } : {}),
    teacher: { connect: { id: input.teacherId } },
    ...(input.subjectId ? { subject: { connect: { id: input.subjectId } } } : {}),
    ...(input.classGroupId ? { classGroup: { connect: { id: input.classGroupId } } } : {}),
  };
  Object.defineProperty(data, "subjectId", {
    value: input.subjectId ?? null,
    enumerable: false,
  });
  Object.defineProperty(data, "classGroupId", {
    value: input.classGroupId ?? null,
    enumerable: false,
  });

  const scheduledClass = await database.scheduledClass.create({
    data,
  });

  return scheduledClass;
}

export async function updateScheduledClass(
  classId: string,
  input: ScheduledClassUpdateInput,
  database: ScheduleDatabase = prisma,
) {
  if (input.teacherId) {
    await assertTeacherAccount(input.teacherId, database);
  }
  if (input.subjectId) {
    await assertSubjectExists(input.subjectId, database);
  }
  if (input.classGroupId) {
    await assertClassGroupExists(input.classGroupId, database);
  }

  const before = await database.scheduledClass.findUnique({
    where: { id: classId },
  });

  const { teacherId, subjectId, classGroupId, ...rest } = input;
  const data: Prisma.ScheduledClassUpdateInput = {
    ...rest,
    ...(teacherId ? { teacher: { connect: { id: teacherId } } } : {}),
    ...(subjectId !== undefined
      ? subjectId
        ? { subject: { connect: { id: subjectId } } }
        : { subject: { disconnect: true } }
      : {}),
    ...(classGroupId !== undefined
      ? classGroupId
        ? { classGroup: { connect: { id: classGroupId } } }
        : { classGroup: { disconnect: true } }
      : {}),
  };
  if (subjectId !== undefined) {
    Object.defineProperty(data, "subjectId", {
      value: subjectId,
      enumerable: false,
    });
  }
  if (classGroupId !== undefined) {
    Object.defineProperty(data, "classGroupId", {
      value: classGroupId,
      enumerable: false,
    });
  }

  const after = await database.scheduledClass.update({
    where: { id: classId },
    data,
  });

  return Object.assign(after, {
    before: before ? mutationSnapshot(before) : { id: classId },
    after: mutationSnapshot(after),
  });
}

export async function deleteScheduledClass(classId: string, database: ScheduleDatabase = prisma) {
  const existing = await database.scheduledClass.findUnique({
    where: { id: classId },
    include: {
      _count: {
        select: {
          students: true,
          assignments: true,
          courseMaterials: true,
          reminders: true,
        },
      },
      assignments: {
        select: {
          _count: {
            select: { submissions: true },
          },
        },
      },
    },
  });
  if (!existing) {
    throw new Error("Scheduled class not found.");
  }

  const dependencyCounts = {
    enrolledStudents: existing._count?.students ?? 0,
    assignments: existing._count?.assignments ?? 0,
    submissions:
      existing.assignments?.reduce(
        (total, assignment) => total + (assignment._count?.submissions ?? 0),
        0,
      ) ?? 0,
    courseMaterials: existing._count?.courseMaterials ?? 0,
    reminders: existing._count?.reminders ?? 0,
  };
  const blockingDependencies = Object.entries(dependencyCounts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}: ${count}`);

  if (blockingDependencies.length > 0) {
    throw new Error(
      `Scheduled class has dependencies and cannot be deleted safely (${blockingDependencies.join(
        ", ",
      )}). Remove dependencies or introduce an explicit archive workflow first.`,
    );
  }

  await database.scheduledClass.delete({ where: { id: classId } });
  return { ...mutationSnapshot(existing), deletedAt: new Date() };
}

export function getScheduledClassSnapshot(scheduledClass: Parameters<typeof mutationSnapshot>[0]) {
  return mutationSnapshot(scheduledClass);
}

export async function listUpcomingClassesForReminders(windowStart: Date, windowEnd: Date) {
  const recentReminderSince = new Date(Date.now() - 1000 * 60 * 60 * 24);

  return prisma.scheduledClass.findMany({
    where: {
      startAt: {
        gte: windowStart,
        lte: windowEnd,
      },
      status: { in: ["SCHEDULED", "LIVE", "RESCHEDULED"] },
    },
    include: {
      teacher: {
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneWhatsapp: true,
        },
      },
      subject: { select: subjectSelect },
      students: {
        select: {
          id: true,
        },
      },
      classGroup: {
        select: {
          teacherId: true,
          teacher: {
            select: {
              id: true,
            },
          },
          students: {
            select: {
              id: true,
            },
          },
        },
      },
      reminders: {
        where: {
          createdAt: { gte: recentReminderSince },
          OR: [
            { createdAt: { gte: recentReminderSince } },
            {
              reminderWindowStart: {
                gte: recentReminderSince,
              },
            },
          ],
        },
      },
    },
    orderBy: { startAt: "asc" },
  });
}

export async function createReminderLog(input: {
  scheduledClassId: string;
  recipientUserId: string;
  recipientEmail: string;
  channel: "EMAIL" | "WHATSAPP";
  status: "SENT" | "FAILED" | "SKIPPED";
  details?: string;
  reminderWindowStart?: Date;
  reminderWindowEnd?: Date;
}) {
  return prisma.reminderLog.create({
    data: {
      scheduledClassId: input.scheduledClassId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      channel: input.channel,
      status: input.status,
      details: input.details,
      reminderWindowStart: input.reminderWindowStart,
      reminderWindowEnd: input.reminderWindowEnd,
    },
  });
}

export async function getTeacherClassDetails(teacherId: string, classId: string) {
  return prisma.scheduledClass.findFirst({
    where: {
      id: classId,
      teacherId: teacherId,
    },
    include: {
      students: true,
      assignments: true,
    },
  });
}
