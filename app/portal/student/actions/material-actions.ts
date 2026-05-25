"use server";

import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import {
  type CourseMaterialFilters,
  listStudentCourseMaterials,
} from "@/lib/repositories/course-material-repository";

type StudentMaterialItem = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string;
  safeFileUrl: string | null;
  attachments: Array<{
    filename: string;
    href: string | null;
    mimeType: string;
    size: number;
    storageKey: string;
  }>;
  scheduledClassId: string;
  scheduledClass: { id: string; title: string; startAt: Date | null };
  classGroup: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  className: string;
  subjectName?: string;
  createdAt: Date;
  updatedAt: Date;
};

type StudentMaterialsActionResult =
  | { success: true; data: StudentMaterialItem[] }
  | { success: false; error: string };

type StudentMaterialActionFilters = CourseMaterialFilters & {
  studentId?: string | null;
};

function cleanFilters(filters: StudentMaterialActionFilters = {}): CourseMaterialFilters {
  return {
    ...(filters.classGroupId ? { classGroupId: filters.classGroupId } : {}),
    ...(filters.scheduledClassId ? { scheduledClassId: filters.scheduledClassId } : {}),
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
  };
}

export async function getStudentMaterialsAction(
  filters: StudentMaterialActionFilters = {},
): Promise<StudentMaterialsActionResult> {
  try {
    const session = await requireRole([UserRole.STUDENT]);
    const cleanedFilters = cleanFilters(filters);
    const materials =
      Object.keys(cleanedFilters).length > 0
        ? await listStudentCourseMaterials(session.uid, cleanedFilters)
        : await listStudentCourseMaterials(session.uid);

    return {
      success: true,
      data: materials.map((material) => ({
        id: material.id,
        title: material.title,
        description: material.description ?? null,
        fileUrl: material.fileUrl,
        safeFileUrl: material.safeFileUrl,
        attachments: material.attachments,
        scheduledClassId: material.scheduledClassId,
        scheduledClass: material.scheduledClass,
        classGroup: material.classGroup,
        subject: material.subject,
        className: material.scheduledClass.title,
        subjectName: material.subject?.name ?? undefined,
        createdAt: material.createdAt,
        updatedAt: material.updatedAt,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load student materials",
    };
  }
}
