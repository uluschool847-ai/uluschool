import { prisma } from "@/lib/prisma";
import { EnquiryStatus, TaskStatus } from "@prisma/client";

export async function createManagerTask(data: { title: string; description: string; dueDate: Date; relatedEnquiryId?: string }) {
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

/**
 * Automates creating tasks for stale enquiries (e.g. IN_REVIEW for more than 3 days).
 * This function is intended to be called by a secure cron endpoint.
 */
export async function generateTasksForStaleEnquiries() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const staleEnquiries = await prisma.enquiry.findMany({
    where: {
      status: EnquiryStatus.IN_REVIEW,
      updatedAt: { lt: threeDaysAgo },
      managerTasks: {
        none: { status: TaskStatus.PENDING } // Only if there are no pending tasks already
      }
    }
  });

  const tasksCreated = [];
  for (const enquiry of staleEnquiries) {
    const task = await createManagerTask({
      title: `Follow up on stale enquiry: ${enquiry.studentName}`,
      description: `This enquiry has been in IN_REVIEW status for more than 3 days without updates. Please reach out to ${enquiry.parentGuardianName} at ${enquiry.email}.`,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 1 day
      relatedEnquiryId: enquiry.id,
    });
    tasksCreated.push(task);
  }

  return tasksCreated;
}
