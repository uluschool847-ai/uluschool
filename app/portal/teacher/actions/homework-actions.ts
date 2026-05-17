"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  archiveHomeworkAssignment,
  createHomeworkAssignment,
  updateHomeworkAssignment,
} from "@/lib/repositories/portal-repository";

const dueDateRequiredMessage = "Due date is required";

const createHomeworkSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional().default(""),
  classId: z.string().trim().min(1, "Class is required"),
  subjectId: z.string().trim().optional(),
  dueDate: z
    .string()
    .trim()
    .min(1, dueDateRequiredMessage)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Due date is invalid"),
});

const editHomeworkSchema = z.object({
  title: z.string().trim().min(1, "Title is required").optional(),
  description: z.string().trim().optional(),
  classId: z.string().trim().min(1, "Class is required").optional(),
  subjectId: z.string().trim().optional().nullable(),
  dueDate: z
    .string()
    .trim()
    .min(1, dueDateRequiredMessage)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Due date is invalid")
    .optional(),
});

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string | Record<string, string[] | undefined> };

export async function createHomeworkAction(data: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = createHomeworkSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const created = await createHomeworkAssignment({
      title: parsed.data.title,
      description: parsed.data.description,
      classId: parsed.data.classId,
      dueDate: new Date(parsed.data.dueDate),
      teacherId: session.uid,
      subjectId: parsed.data.subjectId ?? null,
    });

    return { success: true, data: { id: created.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create homework assignment",
    };
  }
}

export async function editHomeworkAction(
  id: string,
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = editHomeworkSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const updated = await updateHomeworkAssignment(id, session.uid, {
      title: parsed.data.title,
      description: parsed.data.description,
      classId: parsed.data.classId,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      subjectId: parsed.data.subjectId ?? undefined,
    });

    return { success: true, data: { id: updated.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update homework assignment",
    };
  }
}

export async function archiveHomeworkAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const archived = await archiveHomeworkAssignment(id, session.uid);
    return { success: true, data: { id: archived.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive homework assignment",
    };
  }
}

export async function submitHomeworkAction(data: unknown): Promise<ActionResult<{ id: string }>> {
  return createHomeworkAction(data);
}
