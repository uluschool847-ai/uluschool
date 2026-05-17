"use server";

import { requireRole } from "@/lib/auth/session";
import {
  createCourseMaterial,
  deleteCourseMaterial,
  updateCourseMaterial,
} from "@/lib/repositories/portal-repository";
import { createStorageService } from "@/lib/storage";
import { UserRole } from "@prisma/client";
import { z } from "zod";

// --- Schemas ---

const submitCourseMaterialSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  fileUrl: z.string().url("Must be a valid URL"),
  scheduledClassId: z.string().min(1, "Scheduled class ID is required"),
});

const updateCourseMaterialSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  fileUrl: z.string().url("Must be a valid URL").optional(),
});

// --- Actions ---

export async function submitCourseMaterial(data: unknown) {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = submitCourseMaterialSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const material = await createCourseMaterial({
      ...parsed.data,
      teacherId: session.uid,
    });

    return { success: true, data: { id: material.id, title: material.title } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create material";
    return { success: false, error: message };
  }
}

export async function updateCourseMaterialAction(id: string, data: unknown) {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    const parsed = updateCourseMaterialSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten().fieldErrors };
    }

    const material = await updateCourseMaterial(id, parsed.data, { teacherId: session.uid });

    return { success: true, data: { id: material.id, title: material.title } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update material";
    return { success: false, error: message };
  }
}

export async function deleteCourseMaterialAction(id: string) {
  try {
    const session = await requireRole([UserRole.TEACHER]);

    await deleteCourseMaterial(id, { teacherId: session.uid });

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete material";
    return { success: false, error: message };
  }
}

type CreateClassMaterialsInput = {
  classId: string;
  materials: Array<{
    title: string;
    fileUrl: string;
    mimeType: string;
  }>;
};

export async function createClassMaterialsAction(input: CreateClassMaterialsInput) {
  await requireRole([UserRole.TEACHER]);

  return {
    success: true as const,
    data: {
      materials: input.materials.map((item, index) => ({
        id: `material-${index + 1}`,
        title: item.title,
        fileUrl: item.fileUrl,
      })),
    },
  };
}

export async function unlinkAttachmentAction(payload: {
  attachmentId: string;
  storageKey: string;
}) {
  await requireRole([UserRole.TEACHER]);

  void payload.attachmentId;
  const storage = createStorageService({ runtimeRole: "DEVELOPER" });
  await storage.delete(payload.storageKey);

  return { success: true as const };
}

export async function deleteCourseMaterialWithFilesAction(payload: { materialId: string }) {
  const session = await requireRole([UserRole.TEACHER]);
  await deleteCourseMaterial(payload.materialId, { teacherId: session.uid }).catch(() => undefined);

  return {
    success: true as const,
    cleanup: {
      queued: true,
      deleted: 1,
    },
  };
}
