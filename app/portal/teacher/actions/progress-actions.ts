"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  type ProgressPerformanceLevel,
  createProgressNote,
  updateProgressNote,
} from "@/lib/repositories/portal-repository";

const performanceLevels = ["EXCELLENT", "GOOD", "STRUGGLING"] as const;

const submitProgressSchema = z.object({
  studentId: z.string().trim().min(1, "Student is required"),
  subjectId: z.string().trim().min(1, "Subject is required"),
  content: z.string().trim().min(1, "Content is required"),
  performanceLevel: z.enum(performanceLevels, {
    errorMap: () => ({ message: "Performance level is invalid" }),
  }),
});

const editProgressSchema = z.object({
  content: z.string().trim().min(1, "Content is required"),
  performanceLevel: z.enum(performanceLevels, {
    errorMap: () => ({ message: "Performance level is invalid" }),
  }),
});

type ProgressActionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: string | Record<string, string[] | undefined> };

function normalizeActionError(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

export async function submitProgressNoteAction(payload: unknown): Promise<ProgressActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = submitProgressSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.flatten().fieldErrors,
      };
    }

    const created = await createProgressNote({
      studentId: parsed.data.studentId,
      teacherId: session.uid,
      subjectId: parsed.data.subjectId,
      content: parsed.data.content,
      performanceLevel: parsed.data.performanceLevel as ProgressPerformanceLevel,
    });

    return {
      success: true,
      data: { id: created.id },
    };
  } catch (error) {
    return {
      success: false,
      error: normalizeActionError(error),
    };
  }
}

export async function editProgressNoteAction(
  noteId: string,
  payload: unknown,
): Promise<ProgressActionResult> {
  try {
    const session = await requireRole([UserRole.TEACHER]);
    const parsed = editProgressSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.flatten().fieldErrors,
      };
    }

    const updated = await updateProgressNote(noteId, session.uid, {
      content: parsed.data.content,
      performanceLevel: parsed.data.performanceLevel as ProgressPerformanceLevel,
    });

    return {
      success: true,
      data: { id: updated.id },
    };
  } catch (error) {
    return {
      success: false,
      error: normalizeActionError(error),
    };
  }
}
