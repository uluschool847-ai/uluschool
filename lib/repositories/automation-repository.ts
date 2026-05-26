import {
  AttendanceStatus,
  EnquiryStatus,
  type Prisma,
  SubscriptionStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AutomationDatabase = typeof prisma | Prisma.TransactionClient;

export async function createManagerTask(data: {
  title: string;
  description: string;
  dueDate: Date;
  priority?: TaskPriority;
  relatedEnquiryId?: string;
}) {
  return prisma.managerTask.create({
    data,
  });
}

export async function listPendingManagerTasks() {
  return prisma.managerTask.findMany({
    where: {
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
    },
    include: {
      assignedTo: { select: { fullName: true } },
      relatedEnquiry: { select: { studentName: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function completeManagerTask(taskId: string) {
  return prisma.managerTask.update({
    where: { id: taskId },
    data: { status: TaskStatus.COMPLETED },
  });
}

type TaskFilterStatus = "OPEN" | "PENDING" | "IN_PROGRESS" | "COMPLETED";
const TASK_STATUSES = new Set<TaskFilterStatus>(["OPEN", "PENDING", "IN_PROGRESS", "COMPLETED"]);
const TASK_PRIORITIES = new Set<TaskPriority>([
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
]);
const MUTABLE_TASK_STATUSES = new Set<TaskStatus>([
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
]);

function isTaskFilterStatus(status: string | undefined): status is TaskFilterStatus {
  return Boolean(status && TASK_STATUSES.has(status as TaskFilterStatus));
}

function isTaskPriority(priority: string | undefined): priority is TaskPriority {
  return Boolean(priority && TASK_PRIORITIES.has(priority as TaskPriority));
}

function parseMutableTaskStatus(status: string): TaskStatus {
  if (!MUTABLE_TASK_STATUSES.has(status as TaskStatus)) {
    throw new Error("Invalid task status");
  }

  return status as TaskStatus;
}

export async function findAllTasks(
  filters: {
    status?: TaskFilterStatus;
    priority?: TaskPriority;
    assignedAdminId?: string;
  } = {},
) {
  const where: Record<string, unknown> = {};

  if (filters.status === "OPEN") {
    where.status = { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] };
  } else if (isTaskFilterStatus(filters.status)) {
    where.status = filters.status;
  }

  if (isTaskPriority(filters.priority)) {
    where.priority = filters.priority;
  }

  if (filters.assignedAdminId) {
    where.assignedToId = filters.assignedAdminId;
  }

  return prisma.managerTask.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, fullName: true, email: true } },
      relatedEnquiry: { select: { id: true, studentName: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function updateTaskStatus(
  taskId: string,
  status: string,
  database: AutomationDatabase = prisma,
) {
  const nextStatus = parseMutableTaskStatus(status);
  const existing = await database.managerTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new Error("Task not found");
  }

  if (existing?.status === TaskStatus.COMPLETED) {
    throw new Error("Cannot update an already completed task");
  }

  return database.managerTask.update({
    where: { id: taskId },
    data: {
      status: nextStatus,
      updatedAt: new Date(),
    },
  });
}

export async function assignTask(
  taskId: string,
  adminId: string | null,
  database: AutomationDatabase = prisma,
) {
  const existing = await database.managerTask.findUnique({
    where: { id: taskId },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Task not found");
  }

  if (adminId) {
    const assignee = await database.appUser.findFirst({
      where: { id: adminId, role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    if (!assignee) {
      throw new Error("Assigned user must be an active admin");
    }
  }

  return database.managerTask.update({
    where: { id: taskId },
    data: {
      assignedToId: adminId,
      updatedAt: new Date(),
    },
  });
}

/**
 * Automates creating tasks for stale enquiries (e.g. IN_PROGRESS for more than 3 days).
 * This function is intended to be called by a secure cron endpoint.
 */
async function generateTasksForStaleEnquiries() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const staleEnquiries = await prisma.enquiry.findMany({
    where: {
      status: EnquiryStatus.IN_PROGRESS,
      updatedAt: { lt: threeDaysAgo },
      managerTasks: {
        none: { status: TaskStatus.PENDING }, // Only if there are no pending tasks already
      },
    },
  });

  const tasksCreated = [];
  for (const enquiry of staleEnquiries) {
    const task = await createManagerTask({
      title: `Follow up on stale enquiry: ${enquiry.studentName}`,
      description: `This enquiry has been in IN_PROGRESS status for more than 3 days without updates. Please reach out to ${enquiry.parentGuardianName} at ${enquiry.email}.`,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 1 day
      priority: TaskPriority.HIGH,
      relatedEnquiryId: enquiry.id,
    });
    tasksCreated.push(task);
  }

  return tasksCreated;
}

async function createTaskIfMissing(
  input: {
    description: string;
    dueDate: Date;
    priority: TaskPriority;
    relatedEnquiryId?: string;
    title: string;
  },
  database: AutomationDatabase = prisma,
) {
  const existing = await database.managerTask.findFirst({
    where: {
      title: input.title,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
    },
    select: { id: true },
  });
  if (existing) return null;

  return database.managerTask.create({ data: input });
}

async function generateTasksForOverduePayments(database: AutomationDatabase = prisma) {
  const subscriptions = await database.studentSubscription.findMany({
    where: { status: SubscriptionStatus.PAST_DUE },
    include: {
      payer: { select: { email: true, fullName: true } },
      student: { select: { email: true, fullName: true } },
    },
    take: 100,
  });
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tasks = [];

  for (const subscription of subscriptions) {
    const task = await createTaskIfMissing(
      {
        title: `Follow up overdue payment: ${subscription.student.fullName}`,
        description: `Subscription ${subscription.planName} is past due. Contact payer ${
          subscription.payer?.fullName ?? subscription.payer?.email ?? "guardian"
        } for ${subscription.student.fullName}.`,
        dueDate,
        priority: TaskPriority.HIGH,
      },
      database,
    );
    if (task) tasks.push(task);
  }

  return tasks;
}

async function generateTasksForRepeatedMissedLessons(database: AutomationDatabase = prisma) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await database.attendanceRecord.groupBy({
    by: ["studentId"],
    where: { markedAt: { gte: since }, status: AttendanceStatus.ABSENT },
    _count: { _all: true },
    having: { studentId: { _count: { gte: 3 } } },
  });
  const students = await database.appUser.findMany({
    where: { id: { in: rows.map((row) => row.studentId) } },
    select: { email: true, fullName: true, id: true },
  });
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tasks = [];

  for (const student of students) {
    const count = rows.find((row) => row.studentId === student.id)?._count._all ?? 0;
    const task = await createTaskIfMissing(
      {
        title: `Review repeated missed lessons: ${student.fullName}`,
        description: `${student.fullName} has ${count} absent lesson records in the last 30 days. Review attendance and contact the family if needed.`,
        dueDate,
        priority: TaskPriority.HIGH,
      },
      database,
    );
    if (task) tasks.push(task);
  }

  return tasks;
}

async function generateTasksForMissingAssignments(database: AutomationDatabase = prisma) {
  const assignments = await database.assignment.findMany({
    where: { archivedAt: null, dueDate: { lt: new Date() } },
    include: {
      scheduledClass: {
        include: {
          classGroup: { include: { students: { select: { id: true, fullName: true } } } },
          students: { select: { id: true, fullName: true } },
        },
      },
      submissions: { select: { studentId: true } },
    },
    take: 200,
  });
  const missingByStudent = new Map<string, { count: number; fullName: string }>();

  for (const assignment of assignments) {
    const submitted = new Set(assignment.submissions.map((submission) => submission.studentId));
    const students = assignment.scheduledClass.classGroup?.students.length
      ? assignment.scheduledClass.classGroup.students
      : assignment.scheduledClass.students;
    for (const student of students) {
      if (submitted.has(student.id)) continue;
      const existing = missingByStudent.get(student.id);
      missingByStudent.set(student.id, {
        count: (existing?.count ?? 0) + 1,
        fullName: student.fullName,
      });
    }
  }

  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tasks = [];
  for (const [, student] of missingByStudent) {
    if (student.count < 3) continue;
    const task = await createTaskIfMissing(
      {
        title: `Review missing assignments: ${student.fullName}`,
        description: `${student.fullName} has ${student.count} overdue assignments without submissions. Create a follow-up plan before escalating.`,
        dueDate,
        priority: TaskPriority.MEDIUM,
      },
      database,
    );
    if (task) tasks.push(task);
  }

  return tasks;
}

async function generateTasksForMissingTermReports(database: AutomationDatabase = prisma) {
  const terms = await database.academicTerm.findMany({
    where: { endDate: { lt: new Date() } },
    orderBy: { endDate: "desc" },
    take: 2,
  });
  const groups = await database.classGroup.findMany({
    where: { status: "ACTIVE" },
    include: {
      students: { select: { id: true, fullName: true } },
    },
    take: 100,
  });
  const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const tasks = [];

  for (const term of terms) {
    for (const group of groups) {
      for (const student of group.students) {
        const existingReport = await database.reportSnapshot.findFirst({
          where: {
            academicTermId: term.id,
            classGroupId: group.id,
            studentId: student.id,
          },
          select: { id: true },
        });
        if (existingReport) continue;

        const task = await createTaskIfMissing(
          {
            title: `Generate term report: ${student.fullName} - ${term.name}`,
            description: `No saved report snapshot exists for ${student.fullName} in ${group.name} for ${term.name}. Teacher/admin should generate and review the report.`,
            dueDate,
            priority: TaskPriority.MEDIUM,
          },
          database,
        );
        if (task) tasks.push(task);
      }
    }
  }

  return tasks;
}

export async function generateRuleBasedAutomationTasks(database: AutomationDatabase = prisma) {
  const [payments, attendance, assignments, reports] = await Promise.all([
    generateTasksForOverduePayments(database),
    generateTasksForRepeatedMissedLessons(database),
    generateTasksForMissingAssignments(database),
    generateTasksForMissingTermReports(database),
  ]);
  const stale = database === prisma ? await generateTasksForStaleEnquiries() : [];

  return [...stale, ...payments, ...attendance, ...assignments, ...reports];
}
