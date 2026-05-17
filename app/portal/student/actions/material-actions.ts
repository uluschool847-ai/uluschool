"use server";

import { requireRole } from "@/lib/auth/session";
import { listStudentCourseMaterials } from "@/lib/repositories/portal-repository";

type StudentMaterialItem = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string;
  scheduledClassId: string;
  className: string;
  subjectName?: string;
};

type StudentMaterialRecord = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string;
  scheduledClassId: string;
  subjectName?: string;
  scheduledClass?: {
    title?: string;
    subject?: {
      name?: string;
    };
  };
  subject?: {
    name?: string;
  };
};

type StudentMaterialsActionResult =
  | { success: true; data: StudentMaterialItem[] }
  | { success: false; error: string };

export async function getStudentMaterialsAction(): Promise<StudentMaterialsActionResult> {
  try {
    const session = await requireRole(["STUDENT"]);
    const materials = await listStudentCourseMaterials(session.uid);

    return {
      success: true,
      data: materials.map((material: StudentMaterialRecord) => ({
        id: material.id,
        title: material.title,
        description: material.description ?? null,
        fileUrl: material.fileUrl,
        scheduledClassId: material.scheduledClassId,
        className: material.scheduledClass?.title ?? "Unknown class",
        subjectName:
          material.subject?.name ??
          material.scheduledClass?.subject?.name ??
          material.subjectName ??
          undefined,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load student materials",
    };
  }
}
