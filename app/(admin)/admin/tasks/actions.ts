"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { assignTask, updateTaskStatus } from "@/lib/repositories/automation-repository";

type TaskStatusInput = "PENDING" | "IN_PROGRESS" | "COMPLETED";

const updateTaskStatusSchema = z.object({
  taskId: z.string().trim().min(1, "Task ID is required."),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
});

const assignTaskSchema = z.object({
  taskId: z.string().trim().min(1, "Task ID is required."),
  adminId: z.string().nullable().optional(),
});

function revalidateTaskPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
}

export async function updateTaskStatusAction(input: { taskId: string; status: TaskStatusInput }) {
  const parsed = updateTaskStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Invalid task status update." };
  }

  try {
    const session = await requireRole([UserRole.ADMIN]);
    const data = await prisma.$transaction(async (tx) => {
      const beforeTask = await tx.managerTask.findUnique({
        where: { id: parsed.data.taskId },
        select: { id: true, status: true, assignedToId: true, title: true },
      });
      if (!beforeTask) {
        throw new Error("Task not found");
      }

      const updatedTask = await updateTaskStatus(parsed.data.taskId, parsed.data.status, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "MANAGER_TASK_STATUS_UPDATED",
          targetType: "manager_task",
          targetId: parsed.data.taskId,
          before: { status: beforeTask.status },
          after: { status: updatedTask.status },
          meta: {
            actorRole: UserRole.ADMIN,
            taskId: parsed.data.taskId,
          },
        },
        tx,
      );
      return updatedTask;
    });
    revalidateTaskPaths();
    return { success: true as const, data, message: "Task status updated" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update task status.",
    };
  }
}

export async function assignTaskAction(input: { taskId: string; adminId?: string | null }) {
  const parsed = assignTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Invalid task assignment." };
  }

  try {
    const session = await requireRole([UserRole.ADMIN]);
    const adminId = parsed.data.adminId?.trim() ? parsed.data.adminId.trim() : null;
    const data = await prisma.$transaction(async (tx) => {
      const beforeTask = await tx.managerTask.findUnique({
        where: { id: parsed.data.taskId },
        select: { id: true, status: true, assignedToId: true, title: true },
      });
      if (!beforeTask) {
        throw new Error("Task not found");
      }

      const updatedTask = await assignTask(parsed.data.taskId, adminId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "MANAGER_TASK_ASSIGNED",
          targetType: "manager_task",
          targetId: parsed.data.taskId,
          before: { assignedToId: beforeTask.assignedToId },
          after: { assignedToId: updatedTask.assignedToId },
          meta: {
            actorRole: UserRole.ADMIN,
            taskId: parsed.data.taskId,
          },
        },
        tx,
      );
      return updatedTask;
    });
    revalidateTaskPaths();
    return { success: true as const, data, message: "Task assignment updated" };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not assign task.",
    };
  }
}
