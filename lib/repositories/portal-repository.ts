import {
  ClassGroupStatus,
  EnquiryStatus,
  LessonStatus,
  type Prisma,
  UserRole,
} from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { canStartLesson as getLessonStartState } from "@/lib/lessons/lesson-status";
import { validateLiveLessonUrl } from "@/lib/lessons/live-lesson-url";
import { prisma } from "@/lib/prisma";

type PortalDatabase = typeof prisma | Prisma.TransactionClient;

export type FindAllUsersFilters = {
  page?: number;
  limit?: number;
  role?: UserRole;
  searchQuery?: string;
};

export async function findAllUsers(filters: FindAllUsersFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? 20);
  const searchQuery = filters.searchQuery?.trim();
  const where: Prisma.AppUserWhereInput = {};

  if (filters.role) {
    where.role = filters.role;
  }

  if (searchQuery) {
    where.OR = [
      { fullName: { contains: searchQuery, mode: "insensitive" } },
      { email: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const [totalCount, items] = await Promise.all([
    prisma.appUser.count({ where }),
    prisma.appUser.findMany({
      where,
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  const result = {
    items,
    totalCount,
    totalPages,
  };

  Object.defineProperties(result, {
    data: { value: items, enumerable: false },
    total: { value: totalCount, enumerable: false },
    page: { value: page, enumerable: false },
    limit: { value: limit, enumerable: false },
  });

  return result as typeof result & {
    data: typeof items;
    total: number;
    page: number;
    limit: number;
  };
}

export async function createUser(
  data: {
    email: string;
    fullName: string;
    role: UserRole;
    phoneWhatsapp?: string;
  },
  database: PortalDatabase = prisma,
) {
  const email = data.email.trim().toLowerCase();
  const existingUser = await database.appUser.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (existingUser) {
    throw new Error("A user with this email already exists.");
  }

  const defaultPassword = process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hashPassword(defaultPassword);
  const user = await database.appUser.create({
    data: {
      email,
      fullName: data.fullName.trim(),
      role: data.role,
      phoneWhatsapp: data.phoneWhatsapp,
      passwordHash,
      isActive: true,
      ...(data.role === UserRole.STUDENT ? { learningStatus: "ACTIVE" as const } : {}),
    },
  });

  return {
    user,
    defaultPassword,
    mustResetPassword: true,
  };
}

export async function updateUserProfile(
  input: {
    userId: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
  },
  database: PortalDatabase = prisma,
) {
  const existingUser = await database.appUser.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUserByEmail = await database.appUser.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
    },
  });

  if (existingUserByEmail && existingUserByEmail.id !== input.userId) {
    throw new Error("A user with this email already exists.");
  }

  try {
    return await database.appUser.update({
      where: { id: input.userId },
      data: {
        fullName: input.fullName.trim(),
        email: normalizedEmail,
        phoneWhatsapp: input.phoneWhatsapp,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      throw new Error("A user with this email already exists.");
    }

    throw error;
  }
}

export async function updateUserRole(
  userId: string,
  newRole: UserRole,
  currentAdminId?: string,
  database: PortalDatabase = prisma,
) {
  void currentAdminId;
  const user = await database.appUser.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
    const adminCount = await database.appUser.count({
      where: { role: UserRole.ADMIN, isActive: true },
    });

    if (adminCount <= 1) {
      throw new Error("Cannot demote the last admin account.");
    }
  }

  const updatedUser = await database.appUser.update({
    where: { id: userId },
    data: { role: newRole },
  });

  return Object.assign(updatedUser, {
    before: { id: user.id, role: user.role },
    after: { id: updatedUser.id, role: updatedUser.role },
  });
}

export async function toggleUserStatus(
  userId: string,
  isActive: boolean,
  currentAdminId?: string,
  database: PortalDatabase = prisma,
) {
  const user = await database.appUser.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (!isActive && currentAdminId && userId === currentAdminId) {
    throw new Error("Cannot deactivate your own account.");
  }

  if (!isActive && user.role === UserRole.ADMIN) {
    const adminCount = await database.appUser.count({
      where: { role: UserRole.ADMIN, isActive: true },
    });

    if (adminCount <= 1) {
      throw new Error("Cannot deactivate the last admin account.");
    }
  }

  const updatedUser = await database.appUser.update({
    where: { id: userId },
    data: { isActive },
  });

  return Object.assign(updatedUser, {
    before: { id: user.id, isActive: user.isActive },
    after: { id: updatedUser.id, isActive: updatedUser.isActive },
  });
}

export type StudentLearningStatusValue = "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";

export async function updateStudentLearningStatus(
  studentId: string,
  learningStatus: StudentLearningStatusValue,
  database: PortalDatabase = prisma,
) {
  const student = await database.appUser.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
      isActive: true,
      learningStatus: true,
    },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Student account not found or not allowed.");
  }

  return database.appUser.update({
    where: { id: studentId },
    data: { learningStatus },
    select: {
      id: true,
      role: true,
      isActive: true,
      learningStatus: true,
    },
  });
}

export type AdminStudentRegistryFilters = {
  page?: number;
  limit?: number;
  searchQuery?: string;
  isActive?: boolean;
  learningStatus?: StudentLearningStatusValue;
  parentLinked?: boolean;
  classLinked?: boolean;
};

export type AdminStudentRegistryRecord = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  learningStatus: StudentLearningStatusValue;
  parents: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
  enrolledClasses: Array<{
    id: string;
    title: string;
    teacher: { id: string; fullName: string } | null;
  }>;
  derivedTeachers: Array<{
    id: string;
    fullName: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminParentRegistryFilters = {
  page?: number;
  limit?: number;
  searchQuery?: string;
  isActive?: boolean;
  studentLinked?: boolean;
};

export type AdminParentRegistryRecord = {
  id: string;
  email: string;
  fullName: string;
  phoneWhatsapp: string | null;
  isActive: boolean;
  role: UserRole;
  children: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

type StudentRegistryTeacher = { id: string; fullName: string };
type StudentRegistryRelation = {
  id: string;
  fullName: string;
  email?: string | null;
};
type StudentRegistryClassRelation = {
  id: string;
  title: string;
  teacher?: StudentRegistryTeacher | null;
};

type StudentRegistryStudentWithRelations = Prisma.AppUserGetPayload<{
  include: {
    parents: {
      select: {
        id: true;
        fullName: true;
        email: true;
      };
    };
    enrolledClasses: {
      include: {
        teacher: {
          select: {
            id: true;
            fullName: true;
          };
        };
      };
    };
  };
}>;

type ParentRegistryParentWithRelations = Prisma.AppUserGetPayload<{
  include: {
    children: {
      select: {
        id: true;
        fullName: true;
        email: true;
        isActive: true;
      };
    };
  };
}>;

function buildAdminParentsWhere(filters: AdminParentRegistryFilters): Prisma.AppUserWhereInput {
  const where: Prisma.AppUserWhereInput = {
    role: UserRole.PARENT,
  };

  if (filters.searchQuery?.trim()) {
    const searchQuery = filters.searchQuery.trim();
    where.OR = [
      { fullName: { contains: searchQuery, mode: "insensitive" } },
      { email: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.studentLinked !== undefined) {
    where.children = filters.studentLinked ? { some: {} } : { none: {} };
  }

  return where;
}

function mapAdminParentRegistryRecord(
  parent: ParentRegistryParentWithRelations,
): AdminParentRegistryRecord {
  return {
    id: parent.id,
    email: parent.email,
    fullName: parent.fullName,
    phoneWhatsapp: parent.phoneWhatsapp ?? null,
    isActive: parent.isActive,
    role: parent.role,
    children: (parent.children ?? []).map((child) => ({
      id: child.id,
      fullName: child.fullName,
      email: child.email ?? null,
      isActive: child.isActive,
    })),
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt,
  };
}

function buildAdminStudentsWhere(filters: AdminStudentRegistryFilters): Prisma.AppUserWhereInput {
  const where: Prisma.AppUserWhereInput = {
    role: UserRole.STUDENT,
  };

  if (filters.searchQuery?.trim()) {
    const searchQuery = filters.searchQuery.trim();
    where.OR = [
      { fullName: { contains: searchQuery, mode: "insensitive" } },
      { email: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.learningStatus !== undefined) {
    where.learningStatus = filters.learningStatus;
  }

  if (filters.parentLinked !== undefined) {
    where.parents = filters.parentLinked ? { some: {} } : { none: {} };
  }

  if (filters.classLinked !== undefined) {
    where.enrolledClasses = filters.classLinked ? { some: {} } : { none: {} };
  }

  return where;
}

function mapAdminStudentRegistryRecord(
  student: StudentRegistryStudentWithRelations,
): AdminStudentRegistryRecord {
  const parents = ((student.parents ?? []) as StudentRegistryRelation[]).map((parent) => ({
    id: parent.id,
    fullName: parent.fullName,
    email: parent.email ?? null,
  }));

  const enrolledClasses = ((student.enrolledClasses ?? []) as StudentRegistryClassRelation[]).map(
    (scheduledClass) => ({
      id: scheduledClass.id,
      title: scheduledClass.title,
      teacher: scheduledClass.teacher
        ? {
            id: scheduledClass.teacher.id,
            fullName: scheduledClass.teacher.fullName,
          }
        : null,
    }),
  );

  const derivedTeachers = new Map<string, StudentRegistryTeacher>();
  for (const scheduledClass of enrolledClasses) {
    if (!scheduledClass.teacher) continue;
    if (!derivedTeachers.has(scheduledClass.teacher.id)) {
      derivedTeachers.set(scheduledClass.teacher.id, scheduledClass.teacher);
    }
  }

  return {
    id: student.id,
    email: student.email,
    fullName: student.fullName,
    isActive: student.isActive,
    learningStatus: (student.learningStatus ?? "ACTIVE") as StudentLearningStatusValue,
    parents,
    enrolledClasses,
    derivedTeachers: Array.from(derivedTeachers.values()),
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

export async function getAdminStudents(filters: AdminStudentRegistryFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? 20);
  const where = buildAdminStudentsWhere(filters);

  const [totalCount, items] = await Promise.all([
    prisma.appUser.count({ where }),
    prisma.appUser.findMany({
      where,
      orderBy: [{ fullName: "asc" }, { email: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        parents: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        enrolledClasses: {
          include: {
            teacher: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  return {
    items: items.map((student) =>
      mapAdminStudentRegistryRecord(student as StudentRegistryStudentWithRelations),
    ),
    totalCount,
    totalPages,
  };
}

export async function getAdminParents(filters: AdminParentRegistryFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? 20);
  const where = buildAdminParentsWhere(filters);

  const [totalCount, items] = await Promise.all([
    prisma.appUser.count({ where }),
    prisma.appUser.findMany({
      where,
      include: {
        children: {
          select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
          },
          orderBy: { fullName: "asc" },
        },
      },
      orderBy: [{ fullName: "asc" }, { email: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  return {
    items: items.map((parent) =>
      mapAdminParentRegistryRecord(parent as ParentRegistryParentWithRelations),
    ),
    totalCount,
    totalPages,
  };
}

export async function getAdminParentById(parentId: string) {
  const parent = await prisma.appUser.findUnique({
    where: { id: parentId },
    include: {
      children: {
        select: {
          id: true,
          fullName: true,
          email: true,
          isActive: true,
        },
        orderBy: { fullName: "asc" },
      },
    },
  });

  if (!parent || parent.role !== UserRole.PARENT) {
    return null;
  }

  return mapAdminParentRegistryRecord(parent as ParentRegistryParentWithRelations);
}

// --- Materials ---

export async function getMaterialsForClass(scheduledClassId: string) {
  return prisma.courseMaterial.findMany({
    where: { scheduledClassId },
  });
}

// --- Homework ---

export type CreateHomeworkAssignmentInput = {
  title: string;
  description: string;
  classId: string;
  dueDate: Date;
  teacherId: string;
  subjectId?: string | null;
};

export type UpdateHomeworkAssignmentInput = {
  title?: string;
  description?: string;
  dueDate?: Date;
  classId?: string;
  subjectId?: string | null;
};

export async function createHomeworkAssignment(input: CreateHomeworkAssignmentInput) {
  return prisma.assignment.create({
    data: {
      title: input.title,
      description: input.description,
      scheduledClassId: input.classId,
      dueDate: input.dueDate,
      teacherId: input.teacherId,
      subjectId: input.subjectId ?? null,
    },
  });
}

export async function getHomeworkAssignmentById(id: string, teacherId: string) {
  return prisma.assignment.findFirst({
    where: {
      id,
      scheduledClass: {
        teacherId,
      },
    },
  });
}

export async function listHomeworkAssignmentsForTeacherClass(classId: string, teacherId: string) {
  return prisma.assignment.findMany({
    where: {
      scheduledClassId: classId,
      scheduledClass: {
        teacherId,
      },
    },
    include: {
      scheduledClass: { select: { title: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function updateHomeworkAssignment(
  id: string,
  teacherId: string,
  data: UpdateHomeworkAssignmentInput,
) {
  return prisma.assignment.update({
    where: { id, teacherId },
    data: {
      title: data.title,
      description: data.description,
      dueDate: data.dueDate,
      scheduledClassId: data.classId,
      subjectId: data.subjectId,
    },
  });
}

export async function archiveHomeworkAssignment(id: string, teacherId: string) {
  return prisma.assignment.update({
    where: { id, teacherId },
    data: { archivedAt: new Date() },
  });
}

export async function getStudentAssignmentWithSubmissionHistory(input: {
  assignmentId: string;
  studentId: string;
}) {
  return prisma.assignment.findFirst({
    where: {
      id: input.assignmentId,
      scheduledClass: {
        students: {
          some: { id: input.studentId },
        },
      },
    },
    include: {
      scheduledClass: {
        select: { title: true },
      },
      submissions: {
        where: { studentId: input.studentId },
        orderBy: { submittedAt: "desc" },
      },
    },
  });
}

type StudentSubmissionInput = {
  studentId: string;
  assignmentId: string;
  contentUrl: string;
};

type StudentResubmissionInput = {
  submissionId: string;
  studentId: string;
  contentUrl: string;
};

export async function createStudentSubmission(input: StudentSubmissionInput) {
  return submitOrResubmitStudentWork(input);
}

export async function resubmitStudentSubmission(input: StudentResubmissionInput) {
  void input.studentId;
  return prisma.submission.update({
    where: { id: input.submissionId },
    data: {
      contentUrl: input.contentUrl,
      submittedAt: new Date(),
    },
  });
}

export async function submitOrResubmitStudentWork(input: StudentSubmissionInput) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: input.assignmentId,
      scheduledClass: {
        students: {
          some: { id: input.studentId },
        },
      },
    },
  });

  if (!assignment) {
    const existingAssignment =
      typeof prisma.assignment.findUnique === "function"
        ? await prisma.assignment.findUnique({
            where: { id: input.assignmentId },
            select: { id: true },
          })
        : { id: input.assignmentId };

    if (!existingAssignment) {
      throw new Error("Assignment not found");
    }

    throw new Error("Unauthorized: Student not enrolled in this assignment's class");
  }

  const submissions = await prisma.submission.findMany({
    where: {
      studentId: input.studentId,
      assignmentId: input.assignmentId,
    },
    orderBy: { submittedAt: "desc" },
    take: 1,
  });
  const existing = Array.isArray(submissions) ? submissions[0] : null;

  if (existing) {
    return prisma.submission.update({
      where: { id: existing.id },
      data: {
        contentUrl: input.contentUrl,
        submittedAt: new Date(),
        grade: null,
        feedback: null,
      },
    });
  }

  return prisma.submission.create({
    data: {
      studentId: input.studentId,
      assignmentId: input.assignmentId,
      contentUrl: input.contentUrl,
    },
  });
}

export async function listTeacherHomework(teacherId: string) {
  return prisma.assignment.findMany({
    where: {
      scheduledClass: {
        teacherId,
      },
    },
    include: {
      scheduledClass: { select: { title: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: "desc" },
  });
}

export type TeacherDashboardData = {
  metrics: {
    activeGroups: number;
    scheduledLessons: number;
    todayLessons: number;
    upcomingLessons: number;
    activeStudents: number;
    activeAssignments: number;
    pendingSubmissions: number;
    gradedThisWeek: number;
    attendanceToMark: number;
    reportsToGenerate: number;
  };
  todayLessons: TeacherDashboardLesson[];
  upcomingLessons: TeacherDashboardLesson[];
  pastLessons: TeacherDashboardLesson[];
  classes: TeacherDashboardClass[];
  activeAssignments: TeacherDashboardAssignment[];
  pendingSubmissions: TeacherDashboardSubmission[];
  alerts: Array<{ id: string; title: string; message: string; href?: string }>;
};

type TeacherDashboardLesson = {
  id: string;
  title: string;
  description: string | null;
  subject: { id: string; name: string; slug: string } | null;
  classGroup: { id: string; name: string } | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status?: string | null;
  liveLessonUrl: string | null;
  meetingProvider?: string | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingUpdatedAt?: Date | null;
  studentsCount: number;
  studentCount: number;
  cancelReason?: string | null;
  startState: { enabled: boolean; href: string | null; reason: string | null };
  detailHref: string;
};

type TeacherDashboardClass = {
  id: string;
  name: string;
  title: string;
  status?: string | null;
  subject: { id: string; name: string; slug: string } | null;
  level?: { id: string; name: string } | null;
  capacity?: number | null;
  classGroup: { id: string; name: string } | null;
  nextLesson: {
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    detailHref: string;
  } | null;
  rosterCount: number;
  activeRosterCount?: number;
  studentCount: number;
  students: Array<{ id: string; fullName: string; email: string }>;
  studentsPreview?: Array<{ id: string; fullName: string; email: string; isActive?: boolean }>;
  studentsMoreCount?: number;
  inactiveStudentsCount?: number;
  upcomingLessonsCount?: number;
  pendingSubmissionsCount?: number;
  activeAssignmentsCount?: number;
  detailHref: string;
  scheduleHref: string;
};

type TeacherDashboardAssignment = {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
  scheduledClassId: string;
  scheduledClassTitle: string;
  classGroup: { id: string; name: string } | null;
  submissionsCount: number;
  submissionCount: number;
  pendingGradingCount: number;
  pendingSubmissionCount: number;
};

type TeacherDashboardSubmission = {
  id: string;
  contentUrl: string;
  submittedAt: Date;
  student: { id: string; fullName: string; email: string };
  studentName: string;
  studentEmail: string;
  assignment: { id: string; title: string };
  assignmentTitle: string;
  classGroup: { id: string; name: string } | null;
  classTitle: string;
  reviewHref: string;
  score: { min: 0; max: 100; value: number | null };
};

type DashboardLessonRecord = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  liveLessonUrl: string | null;
  meetingProvider?: string | null;
  googleCalendarEventId?: string | null;
  googleMeetSpaceName?: string | null;
  meetingUpdatedAt?: Date | null;
  status?: string | null;
  cancelReason?: string | null;
  subject: { id: string; name: string; slug: string } | null;
  students?: Array<{ id: string; fullName?: string; email?: string; isActive?: boolean }>;
  classGroup?: {
    id: string;
    name: string;
    students?: Array<{ id: string; fullName: string; email: string; isActive?: boolean }>;
  } | null;
};

type DashboardClassGroupRecord = {
  id: string;
  name: string;
  status?: string | null;
  capacity?: number | null;
  subject?: { id: string; name: string; slug: string } | null;
  level?: { id: string; name: string } | null;
  students?: Array<{ id: string; fullName: string; email: string; isActive?: boolean }>;
  lessons?: DashboardClassGroupLessonRecord[];
  scheduledClasses?: DashboardClassGroupLessonRecord[];
  assignments?: Array<{
    id: string;
    archivedAt?: Date | null;
    dueDate?: Date;
    submissions?: Array<{ id: string; grade: number | null }>;
  }>;
};

type DashboardClassGroupLessonRecord = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  status?: string | null;
  assignments?: Array<{
    id: string;
    archivedAt?: Date | null;
    dueDate?: Date;
    submissions?: Array<{ id: string; grade: number | null }>;
  }>;
};

function dateKeyInTimezone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).format(date);
}

function datePartsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    second: value("second"),
    year: value("year"),
  };
}

function zonedTimeToUtc(
  timezone: string,
  date: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
) {
  const targetUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    date.hour ?? 0,
    date.minute ?? 0,
    date.second ?? 0,
  );
  const firstGuess = new Date(targetUtc);
  const actualParts = datePartsInTimezone(firstGuess, timezone);
  const actualUtc = Date.UTC(
    actualParts.year,
    actualParts.month - 1,
    actualParts.day,
    actualParts.hour,
    actualParts.minute,
    actualParts.second,
  );

  return new Date(targetUtc - (actualUtc - targetUtc));
}

function dayRangeInTimezone(date: Date, timezone: string) {
  const parts = datePartsInTimezone(date, timezone);
  const start = zonedTimeToUtc(timezone, {
    day: parts.day,
    month: parts.month,
    year: parts.year,
  });
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const nextParts = datePartsInTimezone(nextDay, "UTC");
  const end = zonedTimeToUtc(timezone, {
    day: nextParts.day,
    month: nextParts.month,
    year: nextParts.year,
  });

  return { end, start };
}

function weekRangeInTimezone(date: Date, timezone: string) {
  const parts = datePartsInTimezone(date, timezone);
  const utcNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const dayOfWeek = utcNoon.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday));
  const nextMonday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday + 7),
  );
  const mondayParts = datePartsInTimezone(monday, "UTC");
  const nextMondayParts = datePartsInTimezone(nextMonday, "UTC");

  return {
    end: zonedTimeToUtc(timezone, {
      day: nextMondayParts.day,
      month: nextMondayParts.month,
      year: nextMondayParts.year,
    }),
    start: zonedTimeToUtc(timezone, {
      day: mondayParts.day,
      month: mondayParts.month,
      year: mondayParts.year,
    }),
  };
}

function lessonStudents(record: DashboardLessonRecord) {
  return record.classGroup?.students ?? record.students ?? [];
}

function studentCountForLesson(record: DashboardLessonRecord) {
  return lessonStudents(record).length;
}

function safeStartState(record: DashboardLessonRecord, now: Date) {
  const meetingProvider = record.meetingProvider ?? "MANUAL_URL";
  const validation = validateLiveLessonUrl(record.liveLessonUrl, meetingProvider, {
    required: false,
  });
  const safeLiveLessonUrl = validation.ok ? validation.url : null;
  const evaluationTime = record.status === "LIVE" ? record.startAt : now;

  return getLessonStartState(
    {
      endAt: record.endAt,
      liveLessonUrl: safeLiveLessonUrl,
      meetingProvider,
      startAt: record.startAt,
      status: record.status ?? "SCHEDULED",
    },
    evaluationTime,
  );
}

function mapDashboardLesson(record: DashboardLessonRecord, now: Date): TeacherDashboardLesson {
  const studentsCount = studentCountForLesson(record);
  const classGroup = record.classGroup
    ? { id: record.classGroup.id, name: record.classGroup.name }
    : null;

  return {
    id: record.id,
    title: record.title,
    description: record.description,
    subject: record.subject,
    classGroup,
    startAt: record.startAt,
    endAt: record.endAt,
    timezone: record.timezone ?? "Europe/Kiev",
    status: record.status,
    liveLessonUrl: record.liveLessonUrl,
    meetingProvider: record.meetingProvider,
    googleCalendarEventId: record.googleCalendarEventId,
    googleMeetSpaceName: record.googleMeetSpaceName,
    meetingUpdatedAt: record.meetingUpdatedAt,
    studentsCount,
    studentCount: studentsCount,
    cancelReason: record.cancelReason,
    startState: safeStartState(record, now),
    detailHref: `/portal/teacher/lessons/${record.id}`,
  };
}

function mapDashboardClass(record: DashboardLessonRecord): TeacherDashboardClass {
  const students = lessonStudents(record).filter(
    (student): student is { id: string; fullName: string; email: string } =>
      typeof student.fullName === "string" && typeof student.email === "string",
  );
  const classGroup = record.classGroup
    ? { id: record.classGroup.id, name: record.classGroup.name }
    : null;
  const name = classGroup?.name ?? record.title;

  return {
    id: record.id,
    name,
    title: record.title,
    subject: record.subject,
    classGroup,
    nextLesson: {
      id: record.id,
      title: record.title,
      description: record.description,
      startAt: record.startAt,
      endAt: record.endAt,
      detailHref: `/portal/teacher/lessons/${record.id}`,
    },
    rosterCount: students.length,
    activeRosterCount: students.length,
    studentCount: students.length,
    students: students.slice(0, 4),
    studentsPreview: students.slice(0, 4),
    studentsMoreCount: Math.max(0, students.length - 4),
    inactiveStudentsCount: 0,
    upcomingLessonsCount: 1,
    pendingSubmissionsCount: 0,
    activeAssignmentsCount: 0,
    detailHref: classGroup
      ? `/portal/teacher/classes/${classGroup.id}`
      : `/portal/teacher/lessons/${record.id}`,
    scheduleHref: classGroup
      ? `/portal/teacher/schedule?classGroupId=${classGroup.id}`
      : "/portal/teacher/schedule",
  };
}

function validFutureLesson(lesson: DashboardClassGroupLessonRecord, now: Date) {
  return (
    lesson.startAt >= now &&
    lesson.status !== LessonStatus.CANCELLED &&
    lesson.status !== LessonStatus.COMPLETED
  );
}

function groupLessons(record: DashboardClassGroupRecord) {
  return record.lessons ?? record.scheduledClasses ?? [];
}

function groupAssignments(record: DashboardClassGroupRecord, now: Date) {
  const lessonAssignments = groupLessons(record).flatMap((lesson) => lesson.assignments ?? []);
  const directAssignments = record.assignments ?? [];
  const assignmentsById = new Map<string, (typeof directAssignments)[number]>();

  for (const assignment of [...directAssignments, ...lessonAssignments]) {
    assignmentsById.set(assignment.id, assignment);
  }

  return Array.from(assignmentsById.values()).filter(
    (assignment) => !assignment.archivedAt && (!assignment.dueDate || assignment.dueDate >= now),
  );
}

function mapDashboardClassGroup(
  record: DashboardClassGroupRecord,
  now: Date,
): TeacherDashboardClass {
  const students = record.students ?? [];
  const activeRosterCount = students.filter((student) => student.isActive !== false).length;
  const inactiveStudentsCount = students.length - activeRosterCount;
  const upcomingLessons = groupLessons(record)
    .filter((lesson) => validFutureLesson(lesson, now))
    .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
  const nextLesson = upcomingLessons[0] ?? null;
  const activeAssignments = groupAssignments(record, now);
  const pendingSubmissionsCount = activeAssignments.reduce(
    (total, assignment) =>
      total +
      (assignment.submissions ?? []).filter((submission) => submission.grade === null).length,
    0,
  );
  const studentsPreview = students.slice(0, 4);

  return {
    id: record.id,
    name: record.name,
    title: record.name,
    status: record.status,
    subject: record.subject ?? null,
    level: record.level ?? null,
    capacity: record.capacity ?? null,
    classGroup: { id: record.id, name: record.name },
    nextLesson: nextLesson
      ? {
          id: nextLesson.id,
          title: nextLesson.title,
          description: nextLesson.description,
          startAt: nextLesson.startAt,
          endAt: nextLesson.endAt,
          detailHref: `/portal/teacher/lessons/${nextLesson.id}`,
        }
      : null,
    rosterCount: students.length,
    activeRosterCount,
    studentCount: students.length,
    students: studentsPreview,
    studentsPreview,
    studentsMoreCount: Math.max(0, students.length - studentsPreview.length),
    inactiveStudentsCount,
    upcomingLessonsCount: upcomingLessons.length,
    pendingSubmissionsCount,
    activeAssignmentsCount: activeAssignments.length,
    detailHref: `/portal/teacher/classes/${record.id}`,
    scheduleHref: `/portal/teacher/schedule?classGroupId=${record.id}`,
  };
}

function uniqueDashboardClasses(
  classGroups: DashboardClassGroupRecord[] = [],
  directRecords: DashboardLessonRecord[] = [],
  now = new Date(),
) {
  const groupClasses = classGroups.map((record) => mapDashboardClassGroup(record, now));
  const scheduledGroupFallbacks =
    groupClasses.length === 0
      ? directRecords
          .filter((record) => record.classGroup)
          .map((record) => mapDashboardClass(record))
      : [];
  const directLegacyClasses = directRecords
    .filter((record) => !record.classGroup)
    .map((record) => mapDashboardClass(record));

  return [...groupClasses, ...scheduledGroupFallbacks, ...directLegacyClasses];
}

export async function getTeacherDashboardData(teacherId: string): Promise<TeacherDashboardData> {
  const now = new Date();
  const timezone = "Europe/Kiev";
  const todayKey = dateKeyInTimezone(now, timezone);
  const todayRange = dayRangeInTimezone(now, timezone);
  const weekRange = weekRangeInTimezone(now, timezone);
  const teacherLessonWhere: Prisma.ScheduledClassWhereInput = {
    OR: [{ teacherId }, { classGroup: { teacherId } }],
  };
  const teacherAssignmentWhere: Prisma.AssignmentWhereInput = {
    OR: [
      { teacherId },
      { scheduledClass: { teacherId } },
      { scheduledClass: { classGroup: { teacherId } } },
    ],
  };
  const upcomingTeacherLessonWhere: Prisma.ScheduledClassWhereInput = {
    ...teacherLessonWhere,
    startAt: { gte: now },
    status: { notIn: [LessonStatus.CANCELLED, LessonStatus.COMPLETED] },
  };
  const pastTeacherLessonWhere: Prisma.ScheduledClassWhereInput = {
    ...teacherLessonWhere,
    startAt: { lt: now },
  };

  const [
    activeGroups,
    scheduledLessons,
    todayLessonsMetric,
    upcomingLessonsMetric,
    activeAssignmentsMetric,
    pendingSubmissionsMetric,
    gradedThisWeek,
    activeStudentRows = [],
    classGroups = [],
    directLegacyClasses = [],
    activeAssignments,
    pendingSubmissions,
    upcomingLessons,
    pastLessons = [],
  ] = await Promise.all([
    prisma.classGroup.count({
      where: {
        teacherId,
        status: ClassGroupStatus.ACTIVE,
      },
    }),
    prisma.scheduledClass.count({
      where: teacherLessonWhere,
    }),
    prisma.scheduledClass.count({
      where: {
        ...teacherLessonWhere,
        startAt: {
          gte: todayRange.start,
          lt: todayRange.end,
        },
      },
    }),
    prisma.scheduledClass.count({
      where: upcomingTeacherLessonWhere,
    }),
    prisma.assignment.count({
      where: {
        ...teacherAssignmentWhere,
        archivedAt: null,
        dueDate: { gte: now },
      },
    }),
    prisma.submission.count({
      where: {
        grade: null,
        assignment: teacherAssignmentWhere,
      },
    }),
    prisma.submission.count({
      where: {
        grade: { not: null },
        updatedAt: {
          gte: weekRange.start,
          lt: weekRange.end,
        },
        assignment: teacherAssignmentWhere,
      },
    }),
    prisma.appUser.findMany({
      where: {
        isActive: true,
        role: UserRole.STUDENT,
        OR: [
          {
            enrolledClassGroups: {
              some: {
                teacherId,
                status: ClassGroupStatus.ACTIVE,
              },
            },
          },
          {
            enrolledClasses: {
              some: teacherLessonWhere,
            },
          },
        ],
      },
      select: { id: true },
      distinct: ["id"],
    }),
    prisma.classGroup.findMany({
      where: {
        teacherId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        capacity: true,
        subject: { select: { id: true, name: true, slug: true } },
        level: { select: { id: true, name: true } },
        students: { select: { id: true, fullName: true, email: true, isActive: true } },
        lessons: {
          select: {
            id: true,
            title: true,
            description: true,
            startAt: true,
            endAt: true,
            status: true,
            assignments: {
              select: {
                id: true,
                archivedAt: true,
                dueDate: true,
                submissions: { select: { id: true, grade: true } },
              },
            },
          },
          orderBy: { startAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.scheduledClass.findMany({
      where: {
        teacherId,
        classGroupId: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        timezone: true,
        liveLessonUrl: true,
        meetingProvider: true,
        googleCalendarEventId: true,
        googleMeetSpaceName: true,
        meetingUpdatedAt: true,
        status: true,
        cancelReason: true,
        subject: { select: { id: true, name: true, slug: true } },
        students: { select: { id: true, fullName: true, email: true, isActive: true } },
        classGroup: {
          select: {
            id: true,
            name: true,
            students: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    prisma.assignment.findMany({
      where: {
        ...teacherAssignmentWhere,
        archivedAt: null,
        dueDate: { gte: now },
      },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        scheduledClassId: true,
        scheduledClass: {
          select: {
            id: true,
            title: true,
            subject: { select: { id: true, name: true, slug: true } },
            classGroup: { select: { id: true, name: true } },
          },
        },
        submissions: {
          select: {
            id: true,
            grade: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.submission.findMany({
      where: {
        grade: null,
        assignment: teacherAssignmentWhere,
      },
      select: {
        id: true,
        contentUrl: true,
        submittedAt: true,
        grade: true,
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        assignment: {
          select: {
            id: true,
            title: true,
            scheduledClass: {
              select: {
                id: true,
                title: true,
                subject: { select: { id: true, name: true, slug: true } },
                classGroup: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 8,
    }),
    prisma.scheduledClass.findMany({
      where: upcomingTeacherLessonWhere,
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        timezone: true,
        liveLessonUrl: true,
        meetingProvider: true,
        googleCalendarEventId: true,
        googleMeetSpaceName: true,
        meetingUpdatedAt: true,
        status: true,
        cancelReason: true,
        subject: { select: { id: true, name: true, slug: true } },
        students: { select: { id: true, fullName: true, email: true } },
        classGroup: {
          select: {
            id: true,
            name: true,
            students: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    prisma.scheduledClass.findMany({
      where: pastTeacherLessonWhere,
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        timezone: true,
        liveLessonUrl: true,
        meetingProvider: true,
        googleCalendarEventId: true,
        googleMeetSpaceName: true,
        meetingUpdatedAt: true,
        status: true,
        cancelReason: true,
        subject: { select: { id: true, name: true, slug: true } },
        students: { select: { id: true, fullName: true, email: true } },
        classGroup: {
          select: {
            id: true,
            name: true,
            students: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { startAt: "desc" },
      take: 6,
    }),
  ]);

  const mappedUpcomingLessons = upcomingLessons.map((item) => mapDashboardLesson(item, now));
  const mappedTodayLessons = mappedUpcomingLessons.filter(
    (lesson) => dateKeyInTimezone(lesson.startAt, lesson.timezone) === todayKey,
  );
  const mappedPastLessons = pastLessons.map((item) => mapDashboardLesson(item, now));
  const mappedClasses = uniqueDashboardClasses(classGroups, directLegacyClasses, now);
  const mappedAssignments = activeAssignments.map((item) => {
    const submissionsCount = item.submissions.length;
    const pendingGradingCount = item.submissions.filter((submission) => !submission.grade).length;
    const classGroup = item.scheduledClass.classGroup
      ? { id: item.scheduledClass.classGroup.id, name: item.scheduledClass.classGroup.name }
      : null;

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      dueDate: item.dueDate,
      scheduledClassId: item.scheduledClassId,
      scheduledClassTitle: item.scheduledClass.title,
      classGroup,
      submissionsCount,
      submissionCount: submissionsCount,
      pendingGradingCount,
      pendingSubmissionCount: pendingGradingCount,
    };
  });
  const mappedSubmissions = pendingSubmissions.map((submission) => {
    const classGroup = submission.assignment.scheduledClass.classGroup
      ? {
          id: submission.assignment.scheduledClass.classGroup.id,
          name: submission.assignment.scheduledClass.classGroup.name,
        }
      : null;

    return {
      id: submission.id,
      contentUrl: submission.contentUrl,
      submittedAt: submission.submittedAt,
      student: {
        id: submission.student.id,
        fullName: submission.student.fullName,
        email: submission.student.email,
      },
      studentName: submission.student.fullName,
      studentEmail: submission.student.email,
      assignment: {
        id: submission.assignment.id,
        title: submission.assignment.title,
      },
      assignmentTitle: submission.assignment.title,
      classGroup,
      classTitle: submission.assignment.scheduledClass.title,
      reviewHref: `/portal/teacher/submissions/${submission.id}`,
      score: { min: 0 as const, max: 100 as const, value: submission.grade },
    };
  });
  const studentsCount =
    activeStudentRows.length > 0
      ? activeStudentRows.length
      : new Set(
          directLegacyClasses.flatMap((item) =>
            lessonStudents(item)
              .filter((student) => student.isActive !== false)
              .map((student) => student.id),
          ),
        ).size;

  return {
    metrics: {
      activeGroups,
      scheduledLessons,
      todayLessons: todayLessonsMetric,
      upcomingLessons: upcomingLessonsMetric,
      activeStudents: studentsCount,
      activeAssignments: activeAssignmentsMetric,
      pendingSubmissions: pendingSubmissionsMetric,
      gradedThisWeek,
      attendanceToMark: 0,
      reportsToGenerate: 0,
    },
    todayLessons: mappedTodayLessons,
    upcomingLessons: mappedUpcomingLessons,
    pastLessons: mappedPastLessons,
    classes: mappedClasses,
    activeAssignments: mappedAssignments,
    pendingSubmissions: mappedSubmissions,
    alerts: [],
  };
}

export async function gradeHomework(submissionId: string, grade: number, feedback: string) {
  return prisma.submission.update({
    where: { id: submissionId },
    data: { grade, feedback },
  });
}

export async function gradeSubmissionForTeacher(input: {
  teacherId: string;
  submissionId: string;
  grade: number;
  feedback?: string | null;
}) {
  const ownedSubmission = await prisma.submission.findFirst({
    where: {
      id: input.submissionId,
      assignment: {
        scheduledClass: {
          OR: [{ teacherId: input.teacherId }, { classGroup: { teacherId: input.teacherId } }],
        },
      },
    },
    select: { id: true },
  });

  if (!ownedSubmission) {
    throw new Error("Submission not found or not owned by teacher.");
  }

  return prisma.submission.update({
    where: { id: input.submissionId },
    data: { grade: input.grade, feedback: input.feedback ?? null },
  });
}

export async function listSubmissionsForAssignmentByTeacher(input: {
  teacherId: string;
  assignmentId: string;
}) {
  return prisma.submission.findMany({
    where: {
      assignmentId: input.assignmentId,
      assignment: {
        scheduledClass: {
          teacherId: input.teacherId,
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });
}

export async function getLinkedChildren(parentId: string) {
  const parent = await prisma.appUser.findUnique({
    where: { id: parentId },
    include: {
      children: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (!parent) {
    throw new Error("Parent not found");
  }

  return parent.children;
}

export async function getLinkedParents(studentId: string) {
  const student = await prisma.appUser.findUnique({
    where: { id: studentId },
    include: {
      parents: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!student) {
    throw new Error("Student not found");
  }

  return student.parents;
}

export async function linkStudentParent(
  studentId: string,
  parentId: string,
  database: PortalDatabase = prisma,
) {
  const student = await database.appUser.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
      parents: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Student account not found or not allowed.");
  }

  if (student.parents.some((parent) => parent.id === parentId)) {
    throw new Error("Parent already linked.");
  }

  const parent = await database.appUser.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!parent || parent.role !== UserRole.PARENT) {
    throw new Error("Parent account not found or not allowed.");
  }

  await database.appUser.update({
    where: { id: studentId },
    data: {
      parents: {
        connect: { id: parentId },
      },
    },
  });

  return { studentId, parentId };
}

export async function unlinkStudentParent(
  studentId: string,
  parentId: string,
  database: PortalDatabase = prisma,
) {
  const student = await database.appUser.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
      parents: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Student account not found or not allowed.");
  }

  if (!student.parents.some((parent) => parent.id === parentId)) {
    throw new Error("Parent link not found.");
  }

  await database.appUser.update({
    where: { id: studentId },
    data: {
      parents: {
        disconnect: { id: parentId },
      },
    },
  });

  return { studentId, parentId };
}

export async function linkParentStudent(
  parentId: string,
  studentId: string,
  database: PortalDatabase = prisma,
) {
  const parent = await database.appUser.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      role: true,
      children: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!parent || parent.role !== UserRole.PARENT) {
    throw new Error("Parent account not found or not allowed.");
  }

  const student = await database.appUser.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Student account not found or not allowed.");
  }

  if (parent.children.some((child) => child.id === studentId)) {
    throw new Error("Student already linked.");
  }

  await database.appUser.update({
    where: { id: parentId },
    data: {
      children: {
        connect: { id: studentId },
      },
    },
  });

  return { parentId, studentId };
}

export async function unlinkParentStudent(
  parentId: string,
  studentId: string,
  database: PortalDatabase = prisma,
) {
  const parent = await database.appUser.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      role: true,
      children: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!parent || parent.role !== UserRole.PARENT) {
    throw new Error("Parent account not found or not allowed.");
  }

  if (!parent.children.some((child) => child.id === studentId)) {
    throw new Error("Student link not found.");
  }

  await database.appUser.update({
    where: { id: parentId },
    data: {
      children: {
        disconnect: { id: studentId },
      },
    },
  });

  return { parentId, studentId };
}

type StudentEnrollmentTeacher = {
  id: string;
  fullName: string;
};

type StudentEnrollmentClassRelation = {
  id: string;
  title: string;
  startAt?: Date;
  teacher?: StudentEnrollmentTeacher | null;
};

type StudentEnrollmentStudent = Prisma.AppUserGetPayload<{
  include: {
    enrolledClasses: {
      select: {
        id: true;
      };
    };
  };
}>;

function mapStudentEnrollmentClass(scheduledClass: StudentEnrollmentClassRelation) {
  return {
    id: scheduledClass.id,
    title: scheduledClass.title,
    startAt: scheduledClass.startAt ?? new Date(0),
    teacher: scheduledClass.teacher
      ? {
          id: scheduledClass.teacher.id,
          fullName: scheduledClass.teacher.fullName,
        }
      : null,
  };
}

function hasClassEnrollment(student: StudentEnrollmentStudent, classId: string) {
  return (student.enrolledClasses ?? []).some((scheduledClass) => scheduledClass.id === classId);
}

export async function getEnrolledClasses(studentId: string) {
  const student = await prisma.appUser.findUnique({
    where: { id: studentId },
    include: {
      enrolledClasses: {
        include: {
          teacher: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
  });

  if (!student) {
    return [];
  }

  return (student.enrolledClasses ?? []).map((scheduledClass) =>
    mapStudentEnrollmentClass(scheduledClass),
  );
}

export async function listAvailableClassesForStudentEnrollment(studentId: string) {
  const classes = await prisma.scheduledClass.findMany({
    where: {
      students: {
        none: {
          id: studentId,
        },
      },
    },
    include: {
      teacher: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
  });

  return classes.map((scheduledClass) => mapStudentEnrollmentClass(scheduledClass));
}

export async function linkStudentClass(
  studentId: string,
  classId: string,
  database: PortalDatabase = prisma,
) {
  const student = await database.appUser.findUnique({
    where: { id: studentId },
    include: {
      enrolledClasses: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Student account not found or not allowed.");
  }

  const scheduledClass = await database.scheduledClass.findUnique({
    where: { id: classId },
    select: { id: true },
  });

  if (!scheduledClass) {
    throw new Error("Class not found or not allowed.");
  }

  if (hasClassEnrollment(student as StudentEnrollmentStudent, classId)) {
    throw new Error("Class already enrolled.");
  }

  await database.appUser.update({
    where: { id: studentId },
    data: {
      enrolledClasses: {
        connect: { id: classId },
      },
    },
  });

  return { studentId, classId };
}

export async function unlinkStudentClass(
  studentId: string,
  classId: string,
  database: PortalDatabase = prisma,
) {
  const student = await database.appUser.findUnique({
    where: { id: studentId },
    include: {
      enrolledClasses: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!student || student.role !== UserRole.STUDENT) {
    throw new Error("Student account not found or not allowed.");
  }

  const scheduledClass = await database.scheduledClass.findUnique({
    where: { id: classId },
    select: { id: true },
  });

  if (!scheduledClass) {
    throw new Error("Class not found or not allowed.");
  }

  await database.appUser.update({
    where: { id: studentId },
    data: {
      enrolledClasses: {
        disconnect: { id: classId },
      },
    },
  });

  return { studentId, classId };
}

export async function convertEnquiryToStudent(enquiryId: string) {
  const portalPassword = process.env.DEFAULT_PORTAL_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hashPassword(portalPassword);

  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({
      where: { id: enquiryId },
    });

    if (!enquiry) {
      throw new Error("Enquiry not found");
    }

    const existingByEmail = await tx.appUser.findUnique({
      where: { email: enquiry.email },
      select: {
        id: true,
        role: true,
        fullName: true,
      },
    });

    let parentId: string;
    if (existingByEmail) {
      if (existingByEmail.role !== UserRole.PARENT) {
        throw new Error("Unauthorized: enquiry email is already used by a non-parent account");
      }
      parentId = existingByEmail.id;
    } else {
      const parent = await tx.appUser.create({
        data: {
          email: enquiry.email,
          fullName: enquiry.parentGuardianName,
          role: UserRole.PARENT,
          passwordHash,
        },
      });
      parentId = parent.id;
    }

    const normalizedName = enquiry.studentName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    const studentEmail = `${normalizedName || "student"}.${enquiry.id}@students.local`;

    const student = await tx.appUser.create({
      data: {
        email: studentEmail,
        fullName: enquiry.studentName,
        role: UserRole.STUDENT,
        passwordHash,
        parents: {
          connect: { id: parentId },
        },
      },
    });

    await tx.enquiry.update({
      where: { id: enquiryId },
      data: {
        status: EnquiryStatus.CONVERTED,
        convertedAt: new Date(),
      },
    });

    return student;
  });
}

export async function getParentScopedStudentData(params: { parentId: string; childId: string }) {
  const parent = await prisma.appUser.findUnique({
    where: { id: params.parentId },
    include: {
      children: {
        where: { id: params.childId },
        include: {
          enrolledClasses: true,
          submissions: {
            include: { assignment: true },
            orderBy: { submittedAt: "desc" },
            take: 10,
          },
          studentProgresses: {
            include: { subject: true },
            orderBy: { recordedAt: "desc" },
            take: 10,
          },
        },
      },
    },
  });

  if (!parent) {
    throw new Error("Unauthorized");
  }

  const child = parent.children[0];
  if (!child) {
    throw new Error("Unauthorized");
  }

  return {
    childId: child.id,
    childName: child.fullName,
    enrolledClasses: child.enrolledClasses,
    submissions: child.submissions,
    progress: child.studentProgresses,
  };
}

export async function listParentScopedSubmissions(params: { parentId: string; childId: string }) {
  return prisma.submission.findMany({
    where: {
      studentId: params.childId,
      student: {
        parents: {
          some: { id: params.parentId },
        },
      },
    },
    include: {
      assignment: true,
    },
    orderBy: { submittedAt: "desc" },
  });
}

// --- Student Progress ---

export async function getStudentProgress(studentId: string) {
  return prisma.studentProgress.findMany({
    where: { studentId },
    select: {
      id: true,
      gradeLevel: true,
      teacherNotes: true,
      recordedAt: true,
      subject: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { recordedAt: "desc" },
  });
}

export async function recordStudentProgress(data: {
  studentId: string;
  teacherId: string;
  subjectId: string;
  gradeLevel: ProgressPerformanceLevel;
  teacherNotes: string;
}) {
  return prisma.studentProgress.create({
    data,
  });
}

export type ProgressPerformanceLevel = "EXCELLENT" | "GOOD" | "STRUGGLING";

export type CreateProgressNoteInput = {
  studentId: string;
  teacherId: string;
  subjectId: string;
  content: string;
  performanceLevel: ProgressPerformanceLevel;
};

export type UpdateProgressNoteInput = {
  content: string;
  performanceLevel: ProgressPerformanceLevel;
};

export async function createProgressNote(input: CreateProgressNoteInput) {
  const teacherOwnsStudentContext = await prisma.scheduledClass.findFirst({
    where: {
      teacherId: input.teacherId,
      students: {
        some: { id: input.studentId },
      },
    },
    select: { id: true },
  });

  if (!teacherOwnsStudentContext) {
    throw new Error("Unauthorized");
  }

  return prisma.studentProgress.create({
    data: {
      studentId: input.studentId,
      teacherId: input.teacherId,
      subjectId: input.subjectId,
      teacherNotes: input.content,
      gradeLevel: input.performanceLevel,
    },
  });
}

export async function listProgressNotesForStudentSubject(input: {
  studentId: string;
  subjectId: string;
}) {
  return prisma.studentProgress.findMany({
    where: {
      studentId: input.studentId,
      subjectId: input.subjectId,
    },
    orderBy: { recordedAt: "desc" },
  });
}

export async function updateProgressNote(
  noteId: string,
  teacherId: string,
  input: UpdateProgressNoteInput,
) {
  const ownedNote = await prisma.studentProgress.findMany({
    where: {
      id: noteId,
      teacherId,
    },
    select: { id: true },
    take: 1,
  });

  if (Array.isArray(ownedNote) && ownedNote.length === 0) {
    throw new Error("Unauthorized");
  }

  return prisma.studentProgress.update({
    where: { id: noteId },
    data: {
      teacherNotes: input.content,
      gradeLevel: input.performanceLevel,
    },
  });
}

export async function archiveProgressNote(noteId: string, teacherId: string) {
  const ownedNote = await prisma.studentProgress.findMany({
    where: {
      id: noteId,
      teacherId,
    },
    select: { id: true },
    take: 1,
  });

  if (Array.isArray(ownedNote) && ownedNote.length === 0) {
    throw new Error("Unauthorized");
  }

  return prisma.studentProgress.delete({
    where: { id: noteId },
  });
}

export async function listProgressNotesForTeacherStudentSubject(input: {
  teacherId: string;
  studentId: string;
  subjectId: string;
}) {
  const teacherOwnsStudentContext = await prisma.scheduledClass.findFirst({
    where: {
      teacherId: input.teacherId,
      students: {
        some: { id: input.studentId },
      },
    },
    select: { id: true },
  });

  if (!teacherOwnsStudentContext) {
    throw new Error("Unauthorized");
  }

  return prisma.studentProgress.findMany({
    where: {
      teacherId: input.teacherId,
      studentId: input.studentId,
      subjectId: input.subjectId,
    },
    orderBy: { recordedAt: "desc" },
  });
}

export { listUsersByRole } from "@/lib/repositories/user-repository";
