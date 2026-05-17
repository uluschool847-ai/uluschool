"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { assignTask, updateTaskStatus } from "@/lib/repositories/automation-repository";

type TaskStatusInput = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export async function updateTaskStatusAction(input: { taskId: string; status: TaskStatusInput }) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const data = await prisma.$transaction(async (tx) => {
      const beforeTask = await tx.managerTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, status: true, assignedToId: true, title: true },
      });
      if (!beforeTask) {
        throw new Error("Task not found");
      }

      const updatedTask = await updateTaskStatus(input.taskId, input.status, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "MANAGER_TASK_STATUS_UPDATED",
          targetType: "manager_task",
          targetId: input.taskId,
          before: { status: beforeTask.status },
          after: { status: updatedTask.status },
          meta: {
            actorRole: UserRole.ADMIN,
            taskId: input.taskId,
          },
        },
        tx,
      );
      return updatedTask;
    });
    revalidatePath("/admin/tasks");
    return { success: true as const, data, message: "Task status updated" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update task status.",
    };
  }
}

export async function assignTaskAction(input: { taskId: string; adminId?: string | null }) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const adminId = input.adminId?.trim() ? input.adminId.trim() : null;
    const data = await prisma.$transaction(async (tx) => {
      const beforeTask = await tx.managerTask.findUnique({
        where: { id: input.taskId },
        select: { id: true, status: true, assignedToId: true, title: true },
      });
      if (!beforeTask) {
        throw new Error("Task not found");
      }

      const updatedTask = await assignTask(input.taskId, adminId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "MANAGER_TASK_ASSIGNED",
          targetType: "manager_task",
          targetId: input.taskId,
          before: { assignedToId: beforeTask.assignedToId },
          after: { assignedToId: updatedTask.assignedToId },
          meta: {
            actorRole: UserRole.ADMIN,
            taskId: input.taskId,
          },
        },
        tx,
      );
      return updatedTask;
    });
    revalidatePath("/admin/tasks");
    return { success: true as const, data, message: "Task assignment updated" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not assign task.",
    };
  }
}
