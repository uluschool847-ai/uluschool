import { EnquiryStatus, type Prisma, TaskStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AutomationDatabase = typeof prisma | Prisma.TransactionClient;

export async function createManagerTask(data: {
  title: string;
  description: string;
  dueDate: Date;
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
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
const TASK_STATUSES = new Set<TaskFilterStatus>(["OPEN", "PENDING", "IN_PROGRESS", "COMPLETED"]);
const MUTABLE_TASK_STATUSES = new Set<TaskStatus>([
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
]);

function isTaskFilterStatus(status: string | undefined): status is TaskFilterStatus {
  return Boolean(status && TASK_STATUSES.has(status as TaskFilterStatus));
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

  // ManagerTask does not have a priority column yet. Keep the query param as a safe no-op
  // until product defines and migrates a real priority field.
  void filters.priority;

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
export async function generateTasksForStaleEnquiries() {
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
      relatedEnquiryId: enquiry.id,
    });
    tasksCreated.push(task);
  }

  return tasksCreated;
}
